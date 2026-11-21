// Local witness checker only. A successful invocation is NOT a STARK receipt.
use std::io::{Read, Write};

fn fail() -> ! {
    eprintln!("INVALID_FINANCIAL512_WITNESS");
    std::process::exit(1);
}

fn main() {
    if std::env::args().len() != 1 { fail(); }
    let mut bytes = Vec::new();
    if std::io::stdin().take(262_145).read_to_end(&mut bytes).is_err() || bytes.len() > 262_144 { fail(); }
    let journal = match aegis_financial512_guest::verify_witness_json(&bytes) {
        Ok(public_statement) if public_statement.len() <= 16_384 => public_statement,
        _ => fail(),
    };
    let mut output = std::io::stdout().lock();
    if output.write_all(&journal).is_err() || output.write_all(b"\n").is_err() { fail(); }
}
