/* Isolated liboqs laboratory helper. No private signing key leaves this process.
 * Each mode handles exactly one bounded frame and requires EOF before crypto.
 * This helper neither creates a STARK nor authorizes an Aegis node operation.
 */
#define _POSIX_C_SOURCE 200809L
#include <oqs/oqs.h>

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <unistd.h>

#define EXPECTED_VERSION "0.16.0"
#define MESSAGE_CAP 65536U
#define DSA_PK_BYTES 2592U
#define DSA_SIG_BYTES 4627U
#define KEM_PK_BYTES 1568U
#define KEM_CT_BYTES 1568U
#define KEM_SS_BYTES 32U

static int read_exact(uint8_t *buffer, size_t length) {
    return length == 0 || fread(buffer, 1, length, stdin) == length;
}

static int read_u32(uint32_t *value) {
    uint8_t bytes[4];
    if (!read_exact(bytes, sizeof(bytes))) {
        return 0;
    }
    *value = ((uint32_t) bytes[0] << 24) | ((uint32_t) bytes[1] << 16)
             | ((uint32_t) bytes[2] << 8) | (uint32_t) bytes[3];
    return 1;
}

static int at_eof(void) {
    return fgetc(stdin) == EOF && !ferror(stdin);
}

static int write_exact(const uint8_t *buffer, size_t length) {
    return length == 0 || fwrite(buffer, 1, length, stdout) == length;
}

static int write_u32(uint32_t value) {
    const uint8_t bytes[4] = {
        (uint8_t) (value >> 24), (uint8_t) (value >> 16),
        (uint8_t) (value >> 8), (uint8_t) value
    };
    return write_exact(bytes, sizeof(bytes));
}

static OQS_SIG *signature_algorithm(void) {
    OQS_SIG *sig = OQS_SIG_new(OQS_SIG_alg_ml_dsa_87);
    if (sig != NULL && (sig->length_public_key != DSA_PK_BYTES
                        || sig->length_signature != DSA_SIG_BYTES)) {
        OQS_SIG_free(sig);
        return NULL;
    }
    return sig;
}

static OQS_KEM *kem_algorithm(void) {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_ml_kem_1024);
    if (kem != NULL && (kem->length_public_key != KEM_PK_BYTES
                        || kem->length_ciphertext != KEM_CT_BYTES
                        || kem->length_shared_secret != KEM_SS_BYTES)) {
        OQS_KEM_free(kem);
        return NULL;
    }
    return kem;
}

static int metadata(void) {
    OQS_SIG *sig = signature_algorithm();
    OQS_KEM *kem = kem_algorithm();
    int ok = sig != NULL && kem != NULL && at_eof();
    if (ok) {
        ok = fputs("{\"liboqs_version\":\"" EXPECTED_VERSION "\","
                   "\"allowed_algorithms\":[\"ML-DSA-87\",\"ML-KEM-1024\"],"
                   "\"sizes\":{\"ML-DSA-87\":{\"public_key\":2592,\"signature\":4627},"
                   "\"ML-KEM-1024\":{\"public_key\":1568,\"ciphertext\":1568,\"shared_secret\":32}},"
                   "\"aegis_target_met\":false,\"production_ready\":false}\n", stdout) >= 0;
    }
    OQS_SIG_free(sig);
    OQS_KEM_free(kem);
    return ok;
}

static int verify87(void) {
    uint32_t pk_length = 0, message_length = 0, signature_length = 0;
    uint8_t *pk = NULL, *message = NULL, *signature = NULL;
    OQS_SIG *sig = NULL;
    int ok = 0;
    if (!read_u32(&pk_length) || !read_u32(&message_length)
            || !read_u32(&signature_length) || pk_length != DSA_PK_BYTES
            || message_length > MESSAGE_CAP || signature_length != DSA_SIG_BYTES) {
        goto cleanup;
    }
    pk = OQS_MEM_malloc(pk_length);
    message = OQS_MEM_malloc(message_length == 0 ? 1 : message_length);
    signature = OQS_MEM_malloc(signature_length);
    if (pk == NULL || message == NULL || signature == NULL
            || !read_exact(pk, pk_length) || !read_exact(message, message_length)
            || !read_exact(signature, signature_length) || !at_eof()) {
        goto cleanup;
    }
    sig = signature_algorithm();
    if (sig == NULL) {
        goto cleanup;
    }
    /* The pinned ML-DSA implementation uses pure ML-DSA with empty context. */
    const OQS_STATUS result = OQS_SIG_verify(sig, message, message_length,
                                          signature, signature_length, pk);
    if (result != OQS_SUCCESS && result != OQS_ERROR) {
        goto cleanup;
    }
    ok = fputs(result == OQS_SUCCESS ? "{\"valid\":true}\n" : "{\"valid\":false}\n", stdout) >= 0;
cleanup:
    OQS_SIG_free(sig);
    OQS_MEM_insecure_free(pk);
    OQS_MEM_secure_free(message, message_length == 0 ? 1 : message_length);
    OQS_MEM_insecure_free(signature);
    return ok;
}

static int sample87(void) {
    uint32_t message_length = 0;
    uint8_t *pk = NULL, *sk = NULL, *message = NULL, *signature = NULL;
    size_t secret_key_length = 0, signature_length = 0;
    OQS_SIG *sig = NULL;
    int ok = 0;
    if (!read_u32(&message_length) || message_length > MESSAGE_CAP) {
        goto cleanup;
    }
    message = OQS_MEM_malloc(message_length == 0 ? 1 : message_length);
    if (message == NULL || !read_exact(message, message_length) || !at_eof()) {
        goto cleanup;
    }
    sig = signature_algorithm();
    if (sig == NULL) {
        goto cleanup;
    }
    secret_key_length = sig->length_secret_key;
    pk = OQS_MEM_malloc(DSA_PK_BYTES);
    sk = OQS_MEM_malloc(secret_key_length);
    signature = OQS_MEM_malloc(DSA_SIG_BYTES);
    if (pk == NULL || sk == NULL || signature == NULL
            || OQS_SIG_keypair(sig, pk, sk) != OQS_SUCCESS
            || OQS_SIG_sign(sig, signature, &signature_length, message, message_length, sk) != OQS_SUCCESS
            || signature_length != DSA_SIG_BYTES) {
        goto cleanup;
    }
    /* Wipe the ephemeral signing key before any public bytes are emitted. */
    OQS_MEM_secure_free(sk, secret_key_length);
    sk = NULL;
    ok = write_u32(DSA_PK_BYTES) && write_u32(DSA_SIG_BYTES)
         && write_exact(pk, DSA_PK_BYTES) && write_exact(signature, DSA_SIG_BYTES);
cleanup:
    OQS_SIG_free(sig);
    OQS_MEM_insecure_free(pk);
    OQS_MEM_secure_free(sk, secret_key_length);
    OQS_MEM_secure_free(message, message_length == 0 ? 1 : message_length);
    OQS_MEM_insecure_free(signature);
    return ok;
}

static int private_output_pipe(void) {
    struct stat info;
    /* Node child-process pipes can be Unix sockets; regular files/TTYs fail. */
    return fstat(STDOUT_FILENO, &info) == 0
           && (S_ISFIFO(info.st_mode) || S_ISSOCK(info.st_mode));
}

static int encap1024(void) {
    uint32_t pk_length = 0;
    uint8_t *pk = NULL, *ciphertext = NULL, *shared_secret = NULL;
    OQS_KEM *kem = NULL;
    int ok = 0;
    if (!private_output_pipe() || !read_u32(&pk_length) || pk_length != KEM_PK_BYTES) {
        goto cleanup;
    }
    pk = OQS_MEM_malloc(KEM_PK_BYTES);
    if (pk == NULL || !read_exact(pk, KEM_PK_BYTES) || !at_eof()) {
        goto cleanup;
    }
    kem = kem_algorithm();
    ciphertext = OQS_MEM_malloc(KEM_CT_BYTES);
    shared_secret = OQS_MEM_malloc(KEM_SS_BYTES);
    if (kem == NULL || ciphertext == NULL || shared_secret == NULL
            || OQS_KEM_encaps(kem, ciphertext, shared_secret, pk) != OQS_SUCCESS) {
        goto cleanup;
    }
    /* Shared-secret bytes are sent only to the caller's private binary pipe. */
    ok = write_u32(KEM_CT_BYTES) && write_u32(KEM_SS_BYTES)
         && write_exact(ciphertext, KEM_CT_BYTES) && write_exact(shared_secret, KEM_SS_BYTES);
cleanup:
    OQS_KEM_free(kem);
    OQS_MEM_insecure_free(pk);
    OQS_MEM_insecure_free(ciphertext);
    OQS_MEM_secure_free(shared_secret, KEM_SS_BYTES);
    return ok;
}

int main(int argc, char **argv) {
    const struct rlimit no_core = {0, 0};
    int ok = 0;
    if (argc != 2 || setrlimit(RLIMIT_CORE, &no_core) != 0
            || setvbuf(stdout, NULL, _IONBF, 0) != 0) {
        fputs("OQS helper failed\n", stderr);
        return 1;
    }
    OQS_init();
    if (strcmp(OQS_version(), EXPECTED_VERSION) != 0
            || OQS_randombytes_switch_algorithm(OQS_RAND_alg_system) != OQS_SUCCESS) {
        goto cleanup;
    }
    if (strcmp(argv[1], "metadata") == 0) {
        ok = metadata();
    } else if (strcmp(argv[1], "verify87") == 0) {
        ok = verify87();
    } else if (strcmp(argv[1], "sample87") == 0) {
        ok = sample87();
    } else if (strcmp(argv[1], "encap1024") == 0) {
        ok = encap1024();
    }
    if (ok && fflush(stdout) != 0) {
        ok = 0;
    }
cleanup:
    OQS_destroy();
    if (!ok) {
        fputs("OQS helper failed\n", stderr);
    }
    return ok ? 0 : 1;
}
