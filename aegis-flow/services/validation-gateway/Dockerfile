# Linux x86_64 lab gateway. Build with aegis-flow/ as the context.
FROM debian:bookworm-slim@sha256:c67e92c8099ba22853ab4cfda7cfb494d253d6012ca82dee98ba8976772af018 AS stark-verifier
WORKDIR /build
ENV CARGO_BUILD_JOBS=2 CARGO_HOME=/build-cache/cargo RUSTUP_HOME=/build-cache/rustup
COPY services/proof-engine/verifier/ ./
# Keep installation/build/cleanup in one layer (also practical with Docker's vfs driver).
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export SSL_CERT_FILE=/run/secrets/build_ca CURL_CA_BUNDLE=/run/secrets/build_ca CARGO_HTTP_CAINFO=/run/secrets/build_ca RUSTUP_USE_CURL=1; fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gcc libc6-dev \
    && curl --fail --location --silent --show-error https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init -o /tmp/rustup-init \
    && echo '20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c  /tmp/rustup-init' | sha256sum -c - \
    && chmod +x /tmp/rustup-init \
    && /tmp/rustup-init -y --default-toolchain 1.100.0 --profile minimal --no-modify-path \
    && /build-cache/cargo/bin/cargo build --release --locked \
    && mkdir -p /out/opt/aegis /out/data \
    && cp target/release/aegis-stark-verifier /out/opt/aegis/verify-stark \
    && chown 1000:1000 /out/data \
    && rm -rf /build-cache /build/target /tmp/rustup-init /var/lib/apt/lists/*

FROM node:24-bookworm-slim@sha256:0e2646ab57e77b7a384a0cb59b6815b182c77e1f9c3ba36bd8435bd9c4e6680e
COPY --from=stark-verifier --chown=node:node /out/ /
COPY --chown=node:node . /app/
WORKDIR /app/services/validation-gateway
# Local proving is separate; this image only verifies approved STARK receipts.
ENV NODE_ENV=development AEGIS_MODE=demo PORT=8080 AEGIS_LEDGER_PATH=/data/ledger.sqlite AEGIS_STARK_VERIFIER=/opt/aegis/verify-stark
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
