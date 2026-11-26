//! Typed, read-only replay of the SAME pinned Plonky3 0.8.0 transcript
//! drivers used by batch-stark, HidingFriPcs and FRI. This is an observation
//! of a previously ACCEPTED native proof, not an oracle extractor/QROM proof.
use std::collections::BTreeMap;
use p3_air::symbolic::AirLayout;
use p3_batch_stark::{
    BatchProof,BatchShape,BatchVerifierTranscript,CommonData,
    verifier::commitments_with_opening_points,
    symbolic::get_log_num_quotient_chunks,
};
use p3_field::{BasedVectorSpace,PrimeField32,PrimeCharacteristicRing,Field,TwoAdicField};
use p3_fri::{FriParameters,FriShape,PcsShape,PcsVerifierTranscript};
use p3_fri::VerifierTranscript as FriVerifierTranscript;
use p3_lookup::{Lookups,logup::LogUpGadget};
use p3_uni_stark::{StarkConfig,StarkGenericConfig};
use serde_json::{Value,json};
use crate::{E,F,Pcs,EXT_DIM,LOG_BLOWUP,QUERIES,RANDOM_CODEWORDS};
use crate::audit_challenger::{AuditedChallenger,ChallengeEvent};
use crate::wired_r1cs::{WiredAir,PREP_WIDTH};

type SC=StarkConfig<Pcs,E,AuditedChallenger>;
fn coeffs(value:&E)->Vec<u32>{
    let basis: &[F]=<E as BasedVectorSpace<F>>::as_basis_coefficients_slice(value);
    basis.iter().map(|f|f.as_canonical_u32()).collect()
}
fn params()->FriParameters<()> {
    FriParameters{
        log_blowup:LOG_BLOWUP,log_final_poly_len:0,max_log_arity:1,
        num_queries:QUERIES,batch_proof_of_work_bits:0,
        commit_proof_of_work_bits:0,query_proof_of_work_bits:0,
        mmcs:()
    }
}

/// Replays the entire transcript using public typed drivers. All shape and
/// opening checks are performed by the original verify_batch *before* entry.
/// The replay must agree with the actual observed native challenger events;
/// that equality is checked by the caller.
pub(crate) fn replay_verified(
    air:&WiredAir,proof:&BatchProof<SC>,common:&CommonData<SC>,
)->Result<(Value,Vec<ChallengeEvent>),()>{
    let replay_cfg=crate::audit_config_from_public_program(None);
    let mut challenger=replay_cfg.initialise_challenger();
    let shape=BatchShape{
        trace_widths:vec![4],
        public_value_counts:vec![32],
        preprocessed_widths:vec![PREP_WIDTH],
        has_preprocessed_commitment:common.preprocessed.is_some(),
        num_lookup_instances:1,
        lookup_pow_bits:0,
        has_randomization_commitment:true,
        ood_pow_bits:0,
    };
    let mut batch=BatchVerifierTranscript::<_,F,E,_>::new(&mut challenger,shape);
    batch.instance_bindings(&proof.degree_bits);
    batch.main_phase(proof.commitments.main.clone(),&[air.public_values()]);
    batch.preprocessed_phase(common.preprocessed.as_ref().map(|p|p.commitment.clone()));
    let lookup_gadget=LogUpGadget::new();
    // Replaying a previously accepted proof: every typed transcript result
    // must succeed. A disagreement is a hard audit rejection.
    let _lookup_challenges=batch.lookup_phase(
        &common.lookups,&lookup_gadget,proof.lookup_pow_witness
    ).map_err(|_|())?;
    let terminal_values:Vec<E>=proof.lookup_terminals.iter().flatten()
        .map(|t|t.0).collect();
    let rho=batch.permutation_phase(
        proof.commitments.permutation.clone(),&terminal_values);
    batch.quotient_phase(proof.commitments.quotient_chunks.clone(),
        proof.commitments.random.clone());
    let zeta=batch.ood_phase(proof.ood_pow_witness).map_err(|_|())?;
    // This is the ACTUAL helper called inside verify_batch, with the
    // symbolic quotient sizing from the same compiled AIR.
    let lookups=Lookups::<F>::from_air::<E,_>(air);
    let log_q=get_log_num_quotient_chunks::<F,E,_,_>(
        air,AirLayout::from_air::<F>(air),air.rows(),&lookups,
        replay_cfg.is_zk(),&lookup_gadget);
    let (mut claims,quotient_domains,preprocessed_index)=
        commitments_with_opening_points(
            &replay_cfg,&[air.clone()],zeta,
            &proof.commitments,&proof.opened_values,common,&proof.degree_bits,
            &[PREP_WIDTH],[log_q].as_slice(),
        ).map_err(|_|())?;
    // Reproduce the exact HidingFriPcs::verify_with_preprocessing
    // augmentation of each point with random-codeword values, including
    // the public preprocessing exemption.
    let random=&proof.opening_proof.0;
    if random.len()!=claims.len(){return Err(());}
    for (ci,(claim,random_claim)) in claims.iter_mut().zip(random.iter()).enumerate(){
        if claim.matrices.len()!=random_claim.len(){return Err(());}
        for (matrix,random_matrix) in claim.matrices.iter_mut().zip(random_claim.iter()){
            if matrix.points.len()!=random_matrix.len(){return Err(());}
            let expected=if preprocessed_index==Some(ci){0}else{RANDOM_CODEWORDS};
            for (point,random_point) in matrix.points.iter_mut().zip(random_matrix.iter()){
                if random_point.len()!=expected{return Err(());}
                point.values.extend(random_point);
            }
        }
    }
    let pp=params();
    let mut input_heights:Vec<usize>=claims.iter()
        .flat_map(|c|c.matrices.iter().map(|m|
            m.domain.size().ilog2() as usize+LOG_BLOWUP)).collect();
    input_heights.sort_unstable_by(|a,b|b.cmp(a));input_heights.dedup();
    if input_heights.is_empty(){return Err(());}
    let global_height=input_heights[0];
    let fri_shape=FriShape::new(&pp,&input_heights,global_height);
    let log_arities=fri_shape.log_arities.clone();
    let mut ladder=BTreeMap::<usize,usize>::new();
    let mut terms=Vec::new();
    for (ci,claim) in claims.iter().enumerate(){
        for (mi,matrix) in claim.matrices.iter().enumerate(){
            let h=matrix.domain.size().ilog2() as usize+LOG_BLOWUP;
            for (pi,point) in matrix.points.iter().enumerate(){
                let offset=ladder.entry(h).or_insert(0usize);
                let begin=*offset;
                *offset=offset.checked_add(point.values.len()).ok_or(())?;
                terms.push(json!({
                    "commitment_index":ci,"matrix_index":mi,"opening_index":pi,
                    "input_log_height":h,"domain_rows":matrix.domain.size(),
                    "point_basis":coeffs(&point.point),
                    "alpha_ladder_offset":begin,
                    "polynomial_count":point.values.len(),
                    "hiding_random_codewords":
                        if preprocessed_index==Some(ci){0}else{RANDOM_CODEWORDS},
                    "symbolic_quotient":"sum_j gamma^(offset+j)*(p_j(z)-p_j(X))/(z-X)"
                }));
            }
        }
    }
    let (gamma,betas,indices)=batch.delegate(|chal|{
        let mut pcs=PcsVerifierTranscript::<_,F,E>::new(
            chal,PcsShape::from_claims(&pp,&claims));
        pcs.claimed_openings(&claims).map_err(|_|())?;
        let gamma=pcs.batch_phase(Some(proof.opening_proof.1.batch_pow_witness))
            .map_err(|_|())?;
        let (betas,indices)=pcs.delegate(|chal|{
            let mut fri=FriVerifierTranscript::<_,F,E>::new(chal,fri_shape);
            let betas=fri.commit_rounds(
                &proof.opening_proof.1.commit_phase_commits,
                &proof.opening_proof.1.commit_pow_witnesses
            ).map_err(|_|())?;
            let indices=fri.query_phase(
                &proof.opening_proof.1.final_poly,
                Some(proof.opening_proof.1.query_pow_witness)
            ).map_err(|_|())?;
            fri.finish();
            Ok::<_,()>( (betas,indices) )
        })?;
        pcs.finish();
        Ok::<_,()>( (gamma,betas,indices) )
    })?;
    batch.finish();
    // Exact query-point/denominator map from p3-fri 0.8.0:
    // verifier::open_inputs -> (index >> (max_height-h)), reverse_bits_len,
    // x = F::GENERATOR * two_adic_generator(h)^rev, denominator = z - x.
    // These values are public challenges only, never opened wire values.
    // Use a bounded export to prevent audit CLI memory amplification.
    let total_openings:usize=claims.iter().map(|c|c.matrices.iter()
        .map(|m|m.points.len()).sum::<usize>()).sum();
    let max_denominators=200_000usize;
    if indices.len().checked_mul(total_openings).ok_or(())?>max_denominators{
        return Err(());
    }
    let mut actual_denominators=Vec::with_capacity(indices.len()*total_openings);
    for (qi,&index) in indices.iter().enumerate(){
        if index >= (1usize<<global_height){return Err(());}
        for (ci,claim) in claims.iter().enumerate(){
            for (mi,matrix) in claim.matrices.iter().enumerate(){
                let h=matrix.domain.size().ilog2() as usize+LOG_BLOWUP;
                if h==0||h>global_height||h>=usize::BITS as usize{return Err(());}
                let reduced=index>>(global_height-h);
                let reversed=reduced.reverse_bits()>>(usize::BITS as usize-h);
                let x=F::GENERATOR *
                    F::two_adic_generator(h).exp_u64(reversed as u64);
                for (pi,point) in matrix.points.iter().enumerate(){
                    let denominator=point.point-E::from(x);
                    if denominator.is_zero(){return Err(());}
                    actual_denominators.push(json!({
                        "query":qi,"query_index":index,
                        "commitment_index":ci,"matrix_index":mi,"opening_index":pi,
                        "log_height":h,"reduced_index":reduced,
                        "bit_reversed_index":reversed,
                        "query_x_canonical":x.as_canonical_u32(),
                        "z_basis":coeffs(&point.point),
                        "denominator_basis":coeffs(&denominator)
                    }));
                }
            }
        }
    }
    let events=challenger.events();
    let export=json!({
        "schema":"AEGIS_VERIFIER_TYPED_TRANSCRIPT_REPLAY_V1",
        "replay_driver":"p3_batch_stark::BatchVerifierTranscript + p3_fri::PcsVerifierTranscript + p3_fri::VerifierTranscript",
        "rho_basis":coeffs(&rho),
        "zeta_basis":coeffs(&zeta),
        "pcs_batch_gamma_basis":coeffs(&gamma),
        "fri_fold_beta_bases":betas.iter().map(coeffs).collect::<Vec<_>>(),
        "fri_query_indices":indices,
        "fri_input_log_heights":input_heights,
        "fri_derived_log_arities":log_arities,
        "fri_index_bits":global_height,
        "preprocessed_commitment_index":preprocessed_index,
        "quotient_chunk_domain_counts":quotient_domains.iter().map(Vec::len).collect::<Vec<_>>(),
        "batch_polynomial_terms":terms,
        "batch_ladder_lengths_by_height":ladder,
        "actual_pcs_query_denominator_evaluations":actual_denominators,
        "pcs_denominator_computation":"p3-fri 0.8.0 verifier::open_inputs, independently recomputed from typed domains and queries",
        "denominator_evaluations_exported":true,
        "denominator_evaluations_came_from_upstream_verifier_hook":false,
        "hiding_random_codewords_per_private_point":RANDOM_CODEWORDS,
        "native_transcript_bytes_and_samples_consistent":false,
        "pcs_quantum_oracle_extraction_proved":false,
        "pq128_demonstrated":false
    });
    Ok((export,events))
}
