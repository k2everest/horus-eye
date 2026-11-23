// Isolated experimental relation for host differential checks and a zkVM guest.
// No witness data enters the journal or error strings. SHA-512 relations do not
// confer PQ128 on the RISC Zero proof engine, image ID, transcript or receipts.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use std::collections::BTreeSet;

const MAX_PAYLOAD: usize = 262_144;
const MAX_VALUE: u64 = 9_007_199_254_740_991;
const MAX_LEAVES: u32 = 65_536;
const STATEMENT_VERSION: &str = "AEGIS_EXPERIMENT_RELATION512_V1";
const NOTE_VERSION: &[u8] = b"AEGIS_EXPERIMENT_NOTE512_V2";
const MEMBERSHIP_VERSION: &str = "AEGIS_EXPERIMENT_MEMBERSHIP512_V1";
const ASSET: &[u8] = b"QUEER";
const SUITE: &[u8] = b"AEGIS-EXPERIMENT-SHA512-MLDSA87-V1";
const FAILURE: &str = "INVALID_FINANCIAL512_WITNESS";

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Statement {
    version: String,
    network_id: String,
    asset_id: String,
    anchor_root: String,
    anchor_leaf_count: u32,
    input_commitments: Vec<String>,
    output_commitments: Vec<String>,
    nullifiers: Vec<String>,
    fee: String,
    transaction_binding: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Note {
    version: String,
    network_id: String,
    asset_id: String,
    value: String,
    owner_tag: String,
    randomness: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Membership {
    version: String,
    network_id: String,
    commitment: String,
    leaf_index: u32,
    leaf_count: u32,
    siblings: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    note: Note,
    spend_secret: String,
    membership: Membership,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Witness {
    statement: Statement,
    inputs: Vec<Input>,
    outputs: Vec<Note>,
}

fn require(condition: bool) -> Result<(), ()> {
    if condition { Ok(()) } else { Err(()) }
}
fn valid_network(network: &str) -> bool {
    !network.is_empty() && network.len() <= 64
        && network.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn bytes64(value: &str) -> Result<[u8; 64], ()> {
    require(value.len() == 128 && value.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)))?;
    hex::decode(value).map_err(|_| ())?.try_into().map_err(|_| ())
}
fn amount(value: &str, allow_zero: bool) -> Result<u64, ()> {
    require(!value.is_empty() && value.len() <= 16 && value.bytes().all(|c| c.is_ascii_digit()))?;
    require(value == "0" || !value.starts_with('0'))?;
    let number = value.parse::<u64>().map_err(|_| ())?;
    require(number <= MAX_VALUE && (allow_zero || number != 0))?;
    Ok(number)
}
fn hash(domain: &[u8], parts: &[&[u8]]) -> [u8; 64] {
    let mut h = Sha512::new();
    h.update(b"AEGIS_BINDING_FRAME_V1\0");
    h.update((SUITE.len() as u32).to_be_bytes()); h.update(SUITE);
    h.update((domain.len() as u32).to_be_bytes()); h.update(domain);
    h.update((parts.len() as u32).to_be_bytes());
    for part in parts { h.update((part.len() as u32).to_be_bytes()); h.update(part); }
    h.finalize().into()
}
fn commitment(note: &Note, network: &str) -> Result<([u8; 64], u64), ()> {
    require(note.version.as_bytes() == NOTE_VERSION && note.network_id == network && note.asset_id.as_bytes() == ASSET)?;
    require(valid_network(&note.network_id))?;
    let value = amount(&note.value, false)?;
    let owner = bytes64(&note.owner_tag)?;
    let randomness = bytes64(&note.randomness)?;
    let digest = hash(b"NOTE512_COMMITMENT", &[NOTE_VERSION, network.as_bytes(), ASSET,
        &value.to_be_bytes(), &owner, &randomness]);
    Ok((digest, value))
}
fn verify_membership(path: &Membership, commitment: &[u8; 64], st: &Statement) -> Result<(), ()> {
    require(path.version == MEMBERSHIP_VERSION && path.network_id == st.network_id)?;
    require(bytes64(&path.commitment)? == *commitment && path.leaf_count == st.anchor_leaf_count)?;
    require(path.leaf_count > 0 && path.leaf_count <= MAX_LEAVES && path.leaf_index < path.leaf_count)?;
    let depth = if path.leaf_count == 1 { 0 } else { 32 - (path.leaf_count - 1).leading_zeros() };
    require(path.siblings.len() == depth as usize)?;
    let network = st.network_id.as_bytes();
    let mut value = hash(b"FINANCIAL_TREE_LEAF", &[network, commitment]);
    let mut position = path.leaf_index;
    let mut width = path.leaf_count;
    for encoded in &path.siblings {
        let sibling = bytes64(encoded)?;
        if position % 2 == 0 {
            if position + 1 >= width { require(sibling == value)?; }
            value = hash(b"FINANCIAL_TREE_NODE", &[network, &value, &sibling]);
        } else {
            value = hash(b"FINANCIAL_TREE_NODE", &[network, &sibling, &value]);
        }
        position /= 2; width = (width + 1) / 2;
    }
    let root = hash(b"FINANCIAL_TREE_ROOT", &[network, &path.leaf_count.to_be_bytes(), &value]);
    require(root == bytes64(&st.anchor_root)?)
}
fn unique_digests(values: &[String]) -> Result<(), ()> {
    for value in values { bytes64(value)?; }
    require(values.iter().collect::<BTreeSet<_>>().len() == values.len())
}
fn validate(witness: &Witness) -> Result<(), ()> {
    let st = &witness.statement;
    require(st.version == STATEMENT_VERSION && st.asset_id.as_bytes() == ASSET && valid_network(&st.network_id))?;
    require(st.anchor_leaf_count > 0 && st.anchor_leaf_count <= MAX_LEAVES)?;
    bytes64(&st.anchor_root)?; bytes64(&st.transaction_binding)?;
    require(!witness.inputs.is_empty() && witness.inputs.len() <= 4 && !witness.outputs.is_empty() && witness.outputs.len() <= 4)?;
    require(st.input_commitments.len() == witness.inputs.len() && st.output_commitments.len() == witness.outputs.len() && st.nullifiers.len() == witness.inputs.len())?;
    unique_digests(&st.input_commitments)?; unique_digests(&st.output_commitments)?; unique_digests(&st.nullifiers)?;
    require(!st.input_commitments.iter().any(|c| st.output_commitments.contains(c)))?;
    let mut total_in = 0u64;
    let mut total_out = amount(&st.fee, true)?;
    let network = st.network_id.as_bytes();
    for (i, input) in witness.inputs.iter().enumerate() {
        let (digest, value) = commitment(&input.note, &st.network_id)?;
        require(digest == bytes64(&st.input_commitments[i])?)?;
        verify_membership(&input.membership, &digest, st)?;
        let secret = bytes64(&input.spend_secret)?;
        require(hash(b"NOTE512_OWNER", &[NOTE_VERSION, network, ASSET, &secret]) == bytes64(&input.note.owner_tag)?)?;
        require(hash(b"NOTE512_NULLIFIER", &[NOTE_VERSION, network, ASSET, &digest, &secret]) == bytes64(&st.nullifiers[i])?)?;
        total_in = total_in.checked_add(value).ok_or(())?;
    }
    for (i, output) in witness.outputs.iter().enumerate() {
        let (digest, value) = commitment(output, &st.network_id)?;
        require(digest == bytes64(&st.output_commitments[i])?)?;
        total_out = total_out.checked_add(value).ok_or(())?;
    }
    require(total_in == total_out)
}

/// Validate the exact private relation and return only its PUBLIC statement.
/// Errors intentionally contain no field names, values, secrets or decoder text.
pub fn verify_witness_json(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let operation = || -> Result<Vec<u8>, ()> {
        require(bytes.len() <= MAX_PAYLOAD)?;
        let witness: Witness = serde_json::from_slice(bytes).map_err(|_| ())?;
        validate(&witness)?;
        let journal = serde_json::to_vec(&witness.statement).map_err(|_| ())?;
        require(journal.len() <= 16_384)?;
        Ok(journal)
    };
    operation().map_err(|_| FAILURE.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn amount_and_hex_encodings_are_canonical() {
        for value in ["1", "2100000000000000", "9007199254740991"] { assert!(amount(value, false).is_ok()); }
        assert_eq!(amount("0", true), Ok(0));
        for value in ["", "0", "01", "+1", "-1", "1.0", "1e3", " 1", "1\n", "9007199254740992", "١"] { assert!(amount(value, false).is_err()); }
        assert!(bytes64(&"ab".repeat(64)).is_ok());
        assert!(bytes64(&"AB".repeat(64)).is_err()); assert!(bytes64(&"ab".repeat(32)).is_err());
    }
    #[test]
    fn framed_sha512_matches_the_independent_node_python_vector() {
        assert_eq!(hex::encode(hash(b"TEST", &[b"ab", b"c"])),
            "f69ff1cad6f329c0c1287d183b90c4ba718f937eb874b872652f987369db2f4fd9baaaf3d46d7a3deddaf5768470026cfea4a7be44e7482ddb79549221ed534d");
    }
    #[test]
    fn invalid_payloads_return_only_a_sanitized_error() {
        for payload in [&b"private secret invalid"[..], &b"{}"[..]] { assert_eq!(verify_witness_json(payload), Err(FAILURE.to_string())); }
        assert_eq!(verify_witness_json(&vec![0; MAX_PAYLOAD + 1]), Err(FAILURE.to_string()));
    }
}
