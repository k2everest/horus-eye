#![no_main]
use risc0_zkvm::guest::env;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, io::Read};

risc0_zkvm::guest::entry!(main);
const MAX_VALUE: u64 = 9_007_199_254_740_991;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Statement {
    version: String,
    network_id: String,
    anchor_state_root: String,
    input_commitments: Vec<String>,
    output_commitments: Vec<String>,
    nullifiers: Vec<String>,
    public_amount: u64,
    public_asset_id: String,
    transaction_binding: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Note { asset_id: String, value: u64, owner_tag: String, randomness: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Membership { version: String, commitment: String, index: usize, leaf_count: usize, siblings: Vec<String> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input { note: Note, spend_secret: String, membership: Membership }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Witness { statement: Statement, inputs: Vec<Input>, outputs: Vec<Note> }

fn bytes32(value: &str) -> [u8; 32] {
    assert_eq!(value.len(), 64);
    let bytes = hex::decode(value).expect("hex");
    assert_eq!(hex::encode(&bytes), value);
    bytes.try_into().expect("32 bytes")
}
fn hash(domain: &[u8], pieces: &[&[u8]]) -> String {
    let mut h = Sha256::new(); h.update(domain);
    for piece in pieces { h.update(piece); }
    hex::encode(h.finalize())
}
fn json_hash(value: serde_json::Value) -> String {
    hex::encode(Sha256::digest(serde_json::to_vec(&value).unwrap()))
}
fn commitment(note: &Note, asset: &str) -> String {
    assert_eq!(note.asset_id, asset);
    assert!(!asset.is_empty() && asset.len() <= 64);
    assert!(asset.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-'));
    assert!(note.value > 0 && note.value <= MAX_VALUE);
    let owner = bytes32(&note.owner_tag);
    let randomness = bytes32(&note.randomness);
    hash(b"AEGIS_NOTE_V2\0", &[&[asset.len() as u8], asset.as_bytes(), &note.value.to_be_bytes(), &owner, &randomness])
}
fn verify_membership(path: &Membership, commitment: &str, root: &str) {
    assert_eq!(path.version, "AEGIS-MERKLE-V1");
    assert_eq!(path.commitment, commitment);
    assert!(path.leaf_count > 0 && path.leaf_count <= 1_000_000 && path.index < path.leaf_count);
    let mut position = path.index;
    let mut width = path.leaf_count;
    let expected_depth = (usize::BITS - (path.leaf_count - 1).leading_zeros()) as usize;
    assert_eq!(path.siblings.len(), expected_depth);
    let mut value = json_hash(serde_json::json!(["AEGIS-MERKLE-V1:leaf", commitment]));
    for sibling in &path.siblings {
        bytes32(sibling);
        if position % 2 == 0 {
            if position + 1 >= width { assert_eq!(sibling, &value); }
            value = json_hash(serde_json::json!(["AEGIS-MERKLE-V1:node", value, sibling]));
        } else { value = json_hash(serde_json::json!(["AEGIS-MERKLE-V1:node", sibling, value])); }
        position /= 2; width = (width + 1) / 2;
    }
    assert_eq!(json_hash(serde_json::json!(["AEGIS-MERKLE-V1:root", path.leaf_count, value])), root);
}
fn unique(values: &[String]) { assert_eq!(values.iter().collect::<BTreeSet<_>>().len(), values.len()); }

fn main() {
    let mut bytes = Vec::new();
    std::io::stdin().take(262_145).read_to_end(&mut bytes).unwrap();
    assert!(bytes.len() <= 262_144);
    let witness: Witness = serde_json::from_slice(&bytes).expect("witness");
    let st = &witness.statement;
    assert_eq!(st.version, "AEGIS-ZK-STARK-V1");
    assert!(!st.network_id.is_empty() && st.network_id.len() <= 64);
    assert!(st.network_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-'));
    bytes32(&st.anchor_state_root); bytes32(&st.transaction_binding);
    assert!(witness.inputs.len() > 0 && witness.inputs.len() <= 4);
    assert!(witness.outputs.len() > 0 && witness.outputs.len() <= 4);
    assert_eq!(st.input_commitments.len(), witness.inputs.len());
    assert_eq!(st.output_commitments.len(), witness.outputs.len());
    assert_eq!(st.nullifiers.len(), witness.inputs.len());
    unique(&st.input_commitments); unique(&st.output_commitments); unique(&st.nullifiers);
    assert!(st.public_amount <= MAX_VALUE);
    let mut total_in = 0u64;
    let mut total_out = st.public_amount;
    for (index, input) in witness.inputs.iter().enumerate() {
        let commitment = commitment(&input.note, &st.public_asset_id);
        assert_eq!(commitment, st.input_commitments[index]);
        verify_membership(&input.membership, &commitment, &st.anchor_state_root);
        let secret = bytes32(&input.spend_secret);
        assert_eq!(hash(b"AEGIS_OWNER_V2\0", &[&secret]), input.note.owner_tag);
        assert_eq!(hash(b"AEGIS_NULLIFIER_V2\0", &[&bytes32(&commitment), &secret]), st.nullifiers[index]);
        total_in = total_in.checked_add(input.note.value).unwrap();
    }
    for (index, output) in witness.outputs.iter().enumerate() {
        let commitment = commitment(output, &st.public_asset_id);
        assert_eq!(commitment, st.output_commitments[index]);
        assert!(!st.input_commitments.contains(&commitment));
        total_out = total_out.checked_add(output.value).unwrap();
    }
    assert_eq!(total_in, total_out);
    // Only public statement enters the authenticated journal. No witness/openings/secrets.
    env::commit_slice(&serde_json::to_vec(st).unwrap());
}
