#![no_main]
// Isolated laboratory guest. RISC Zero's complete post-quantum security target
// remains unqualified; this program does not enable a network or production.
use risc0_zkvm::guest::env;
use std::io::Read;

risc0_zkvm::guest::entry!(main);

fn main() {
    let mut bytes = Vec::new();
    if std::io::stdin().take(262_145).read_to_end(&mut bytes).is_err() {
        panic!("INVALID_FINANCIAL512_WITNESS");
    }
    match aegis_financial512_guest::verify_witness_json(&bytes) {
        Ok(public_statement) => env::commit_slice(&public_statement),
        Err(_) => panic!("INVALID_FINANCIAL512_WITNESS"),
    }
}
