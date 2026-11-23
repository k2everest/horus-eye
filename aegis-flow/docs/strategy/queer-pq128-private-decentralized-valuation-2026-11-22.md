# QUEER / Aegis — caminho técnico para uma moeda privada, PQ128 e descentralizada

Data: 2026-11-22. **Estado: proposta versionada de engenharia; nenhum consenso foi alterado.**
Objetivo: preservar o modelo sem lastro e a emissão limitada do usuário, competir por privacidade
financeira, credibilidade matemática e descentralização verificável; não prometer preço ou valuation.

## 1. Configuração que NÃO qualifica PQ128

O laboratório V4 utiliza BabyBear `p=2013265921`, extensão
`BinomialExtensionField<BabyBear,8>`, `HidingFriPcs`, FRI
320 queries, blowup 8, 16 elementos de sal e SHA-512.
`WiredAir` reúne gates Booleanos com LogUp, mas a prova integral dos
seis SHA-512 continua não aprovada e a rede ativa segue usando RISC Zero.

O **teorema de Chiesa–Manohar–Spooner** (TCC 2019, ePrint 2019/834)
para a transformação BCS de IOPs *round-by-round sound* estabelece,
sob hipóteses próprias, `O(Q^2*eps_RBR + Q^3/2^lambda)`
de segurança QROM. Esses fatores NÃO foram ainda instanciados
com constantes para Plonky3 `p3-batch-stark` / LogUp / `HidingFriPcs`.
A cifra 128 se refere ao jogo G1 definido no planejamento: Q=2^128
consultas quânticas globais e erro total <1/2, sob horizonte
hipotético H=2^32 receipts e S<=64 segmentos, com 4 famílias
conservadoras de primeiros eventos ruins.

O componente LogUp tem o limite interativo de upstream
`eps_logup <= N*(W+2)/p^d`, com N=4*2^23 e W=2:
`eps_logup <= 2^27 / p^d`. Portanto a rota CMS,
mesmo com **constante unitária favorável**, produz

```
Q² * (H*64*4) * eps_logup
  <= 2^(128*2 + 32+6+2 + 27) / p^d
  = 2^323 / p^d.
```

BabyBear grau 8:  `log2 p^8 ≈247.255` -> cota ~`2^75.745`, **vácua**.
BabyBear grau 11: `log2 p^11 ≈339.976` -> ~`2^-16.976` antes das constantes.
BabyBear grau 12: `log2 p^12 ≈370.883` -> ~`2^-47.883`.
BabyBear grau 16: `log2 p^16 ≈494.510` -> ~`2^-171.510`.

O mínimo com constante unitária para esse subevento G1 é grau 11;
para G2 (erro adicional <=2^-128), grau 15. **Isso não é prova
de segurança PQ128, nem de que extensões não implementadas existem**.
Uma extensão de grau 16 (ou campo equivalente >=~495 bits)
oferece margem para a perda de segurança, mas exige implementar
e demonstrar irreducibilidade, amostragem sem viés, FFT/PCS,
transcript e compatibilidade do backend. A biblioteca fixada
não oferece simplesmente `BabyBear<16>` como troca de constante.

Como critério de engenharia sugerido **não certificado**,
buscamos `>=336 bits` de **erro RBR algébrico sem cap artificial
de hash** no AIR FINANCEIRO completo. Depois de `2^256` das
consultas quadráticas e `2^40` dos eventos hipotéticos, restam
40 bits: uma reserva arbitrária de até 32 bits para constantes
desconhecidas deixaria 8 bits de margem adicional. O termo de
hash QROM `Q^3/2^512` fica em `2^-88` com o horizonte, ou
`2^-56` com a mesma reserva hipotética. **A verdadeira constante
do teorema NÃO é conhecida; essa reserva não é uma garantia.**

O relatório atual do `p3-security` inclui um teto de 170 bits
de resistência a colisões idealizadas. Não se pode usar esse
teto diretamente como `eps_RBR` e depois multiplicá-lo por
Q² sem distinguir as duas fontes de erro: a cota BCS separa
explicitamente a parte algébrica da parte hash `Q^3/2^lambda`.
São necessárias as contribuições ALI, DEEP, FRI commit, FRI query,
batching e LogUp para o `WiredAir`, com modelo de hash validado
e análise da composição adaptativa.

**Marcos eliminatórios**: prova 1x1 de seis SHA-512 com verifier
independente; RBR integral >= alvo sob parâmetros realmente
implementados; teorema QROM instanciado com constantes finitas
e transcript real; simulador ZK e knowledge-extractor em jogos
quânticos; prova de composição de receipts e estados; auditoria
independente, release reproduzível e ativação versionada.
Nenhum teste de CI isolado substitui esses marcos.

## 2. Privacidade financeira melhor que Bitcoin

Bitcoin é pseudônimo, **não anônimo**: o ledger público permite
tracing. A V2 atual de QUEER expõe
`input_commitments`, `sender_tag` e `pq_public_key` em
`libs/crypto-core/transfer-v2.mjs`; `open-chain/state.mjs`
recusa gasto usando o commitment público específico. Logo não
oferece indistinguibilidade de remetente/entrada.

Desenhar uma V5 totalmente shielded como candidata:
```
public_transfer = {
  version, network_id, anchor_root,
  nullifiers: [fresh pseudorandom nullifier],
  output_commitments: [hiding commitment],
  fee, asset_id, encrypted_outputs, proof, proof_program_id
}
private_witness = {spend_secret, in_note, merkle_path,
                   output_notes, randomness, ownership}
```
Nenhum `input_commitments` específico nem `sender_tag`
reutilizável no statement público. A prova autentica membership,
ownership por segredo privado, inexistência de criação de moeda,
conservação e nullifier. O ledger só usa o conjunto de nullifiers
gastos e uma árvore de commitments. Estabelecer endereço one-time
e recipient view tags **efêmeros**, KEM pós-quântico por saída,
contas de visualização (viewing keys) para transparência seletiva
e blindagem de quantias. Criar testes de não vinculação
via observação dos campos públicos e simulação formal.

O protocolo já suporta ML-DSA-44/65/87 e ML-KEM-512/768/1024
como primitivas de biblioteca. Para a suite PQ reforçada,
avaliar **ML-DSA-87 / ML-KEM-1024** conforme NIST FIPS 204/203,
ponderando custo de bytes, assinaturas, bootstrap e
denominação de domínio. A transação não deve obrigar
exposição de chave/sender permanente para comprovar propriedade
se ela já é demonstrada pelo ZK. Todas as chaves devem ser
específicas da suite e ter proteção contra replay/downgrade.
Desvinculação criptográfica do ledger não oculta automaticamente
IP, timing, tamanhos, fees ou metadados da rede: oferecer
propagação privada e avaliar tamanho fixo/padding e adversários
de rede. Proibir a promessa "100% anônima".

## 3. Descentralização e consenso com vida econômica

O projeto mantém um cap real de **20.000.000 QUEER**,
`105.000.000 AEGIS` por QUEER e cap de
`2.100.000.000.000.000` unidades atômicas. A remuneração
atual é subsídio constante por altura até o cap
(`protocolMintedSupply` / `subsidy`), não é o calendário
de halving do Bitcoin. Nenhuma alteração de emissão, supply
ou genesis foi autorizada por este documento.

**Bug de incentivo/liveness a resolver antes de mainnet:** no
consenso V3 `supplyTarget` reduz o target de PoW com o
quadrado da oferta remanescente, sem usar hashrate ou tempo
de blocos. Com hashrate fixo, antes de atingir a floor:

  emissão 50% -> dificuldade 4x, intervalo esperado 4x;
  emissão 90% -> dificuldade 100x, intervalo 100x;
  emissão 99% -> dificuldade 10.000x, intervalo 10.000x.

Com floor e resposta dos mineradores os números reais mudam,
mas a dependência automática da emissão permanece.
O target para V5 deve ajustar-se **ao hashrate inferido dos tempos
passados**, com janelas, medianas e limites anti-time-warp,
e a emissão deve ter agenda independente da dificuldade.
Publicar testes para oscilações, ataques de timestamps,
reorganizações e mineração egoísta. Auditar se PoW tem vantagem
quântica, sem prometer "PoW imune a Grover".

Descentralização verificável exige genesis imutável,
ausência de premine/owner mint e chaves de administrador,
full nodes reprodutíveis e baratos, P2P aberto e descoberta
sem servidor obrigatório, permissão para qualquer minerador
e wallet, sincronização independente, regras de upgrade
consensuais, auditoria pública da oferta e diversidade de
clientes/hardware. A existência de PoW por si só não basta.

## 4. Posicionamento e valuation

**Proposta de valor:** moeda escassa sem lastro contratual,
pagamentos privados por padrão, transações provadas em
STARK/IOP pós-quântico qualificado, mineração aberta, full
nodes leves e auditoria da inflação sem expor usuários.
Como produto, competir com a privacidade de sistemas
shielded existentes e com a resistência quântica das
primitivas de autenticação, sem afirmar que concorrentes
não possuam essas funcionalidades.

Oferta máxima: 20 milhões QUEER. Os cenários abaixo
são relações contábeis, não projeção de preços:
```
Preço hipotético (USD/QUEER)   FDV com 20M (USD)
                    1                    20.000.000
                   50                 1.000.000.000
                  500                10.000.000.000
                5.000               100.000.000.000
```
FDV = preço hipotético * cap. Market cap circulante usa
a oferta efetivamente emitida, que pode ser muito menor.
Valor de mercado não decorre automaticamente de hard cap,
prova PQ, anonimato ou marketing. É função de liquidez
real, adoção, segurança, uso recorrente, expectativas e
risco regulatório. Não criar volume fictício, recompra
não financiada, wash trading, metas de pump ou simular
adoção inexistente.

Prioridades comerciais condicionadas à segurança:
testnet aberto com medição pública, bug bounty e revisão;
carteira móvel fácil com recuperação e viewing keys;
API de pagamentos e integração de merchant legítimo;
métrica de sucesso de transações e latência de prova p50/p95,
RAM, bytes por receipt, sync de full node, hashrate
distribuído, concentração de peers e disponibilidade.
Estudar regulação das moedas com privacidade em cada jurisdição.

**Condição de liberação:** sem demonstração PQ128, ZK e
ownership integral, não ativar a V5 e não usar "PQ128"
como afirmação comercial de segurança. O PoW, supply e
privacidade podem ser prototipados isoladamente sem
se promover o laboratório a dinheiro público.

Referências: 
- https://www.iacr.org/archive/tcc2019/11891143/11891143.pdf
- https://github.com/Plonky3/Plonky3/tree/v0.8.0
- https://csrc.nist.gov/pubs/fips/203/final
- https://csrc.nist.gov/pubs/fips/204/final
- https://bitcoin.org/en/faq
- https://zcash.github.io/orchard/design/keys.html
