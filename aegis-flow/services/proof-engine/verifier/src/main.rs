use bincode::Options;
use hex::FromHex;
use risc0_zkvm::{sha::Digest, InnerReceipt, Receipt};
use std::{env, fs, process};

fn verify() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 4 { return Err("receipt, statement and trusted image ID required".into()); }
    if fs::metadata(&args[1])?.len() > 8 * 1024 * 1024 || fs::metadata(&args[2])?.len() > 16 * 1024 {
        return Err("oversized input".into());
    }
    let bytes = fs::read(&args[1])?;
    let receipt: Receipt = bincode::DefaultOptions::new().with_fixint_encoding().with_limit(8 * 1024 * 1024).reject_trailing_bytes().deserialize(&bytes)?;
    // This guest has no recursive assumptions. Reject nested receipts as well
    // as Fake/Groth16/other outer variants, and allow only the tested hash suite.
    match &receipt.inner {
        InnerReceipt::Composite(composite)
            if composite.assumption_receipts.is_empty()
                && !composite.segments.is_empty()
                && composite.segments.len() <= 64
                && composite.segments.iter().all(|segment| segment.hashfn == "poseidon2") => {}
        _ => return Err("approved composite STARK receipt required".into()),
    }
    receipt.verify(Digest::from_hex(&args[3])?)?;
    let expected: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
    let actual: serde_json::Value = serde_json::from_slice(&receipt.journal.bytes)?;
    if expected != actual { return Err("public statement mismatch".into()); }
    println!("{{\"valid\":true,\"backend\":\"risc0-composite-3.1.0\"}}");
    Ok(())
}
fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() == 4 && args[1] == "pack" {
        let raw = fs::read(&args[2]).expect("guest ELF");
        let binary = risc0_binfmt::ProgramBinary::new(&raw, risc0_zkos_v1compat::V1COMPAT_ELF).encode();
        let id = risc0_binfmt::compute_image_id(&binary).expect("image ID");
        fs::write(&args[3], &binary).expect("packed guest");
        println!("{id}");
        return;
    }
    if verify().is_err() {
        eprintln!("STARK_VERIFICATION_FAILED");
        process::exit(1);
    }
}
