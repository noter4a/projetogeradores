# Agente SNMP

O próprio servidor Node expõe a telemetria dos geradores via SNMP —
sem processo separado, sem re-assinar MQTT. Ele lê os mesmos dados do
Postgres que a API REST já serve, num loop de polling, e monta uma
tabela SNMP conceitual (uma linha por gerador).

Desligado por padrão. O export com a frota inteira só liga se `SNMP_PORT`
estiver definida (seção 1) — mas você também pode usar **só** exports
individuais por gerador/cliente (seção 5) sem nunca ligar o `SNMP_PORT`
da frota inteira.

## 1. Configuração (`server/.env`)

```
SNMP_PORT=161
SNMP_COMMUNITY=troque-isso-em-producao
SNMP_ENTERPRISE_OID=1.3.6.1.4.1.99999
SNMP_POLL_INTERVAL_MS=15000
```

- **`SNMP_ENTERPRISE_OID`**: troque `99999` pelo seu **PEN** (Private
  Enterprise Number), registrado de graça em
  https://pen.iana.org/pen/PenApplication.page, antes de entregar isso
  a um cliente externo — evita colidir com o OID de outro fabricante.
  Atualize `server/GENERATOR-MIB.mib` com o mesmo número.
- **`SNMP_COMMUNITY`**: nunca deixe `public` em produção.
- A porta `161/udp` já está mapeada no `docker-compose.yml`.

## 2. Firewall

**Nunca** exponha a porta SNMP direto na internet. Restrinja por IP —
normalmente só o IP do sistema de monitoramento do cliente:

```bash
ufw allow from <IP_DO_MONITORAMENTO> to any port 161 proto udp
```

## 3. Testar

```bash
# Lista todas as linhas (uma por gerador)
snmpwalk -v2c -c troque-isso-em-producao <IP_DO_SERVIDOR> 1.3.6.1.4.1.99999.1

# Formato tabular
snmptable -v2c -c troque-isso-em-producao <IP_DO_SERVIDOR> 1.3.6.1.4.1.99999.1

# Um campo específico (ex: tensão do gerador, linha 1)
snmpget -v2c -c troque-isso-em-producao <IP_DO_SERVIDOR> 1.3.6.1.4.1.99999.1.1.7.1
```

## 4. O que é exposto (ver `GENERATOR-MIB.mib`)

Uma linha por gerador — `generatorIndex` é um índice interno estável
(não é o ID do gerador no painel; é atribuído a cada gerador na primeira
vez que o agente o vê, e mantido pelo tempo de vida do processo).
Colunas: `generatorId`, `generatorName`, `statusCode`
(1=parado,2=rodando,3=alarme,4=offline), `connected` (dado recente nos
últimos 120s), tensão de rede/gerador, frequência (Hz×10), RPM,
combustível (%), bateria (V×10), pressão de óleo (bar×100), temperatura
do motor, potência ativa (kW×10), código de alarme, horímetro (h×100) e
timestamp da última leitura.

Os valores decimais vêm multiplicados (documentado na descrição de cada
OID) porque os tipos SNMP padrão (`Gauge32`/`Integer`) só armazenam
inteiros.

## 5. Dar acesso a um cliente para **só um gerador** (ex: Ciklo70)

A biblioteca SNMP usada só suporta nível de acesso global por community
(ReadOnly/ReadWrite/None) — não dá para restringir uma community a
ver só algumas linhas dentro da mesma tabela. Por isso, expor um
gerador específico para um cliente é feito com um **agente próprio,
numa porta própria**, filtrado só naquele(s) gerador(es) — o cliente
nunca vê o resto da frota, mesmo tentando.

No `server/.env`:

```
SNMP_CLIENT_EXPORT_1_PORT=16101
SNMP_CLIENT_EXPORT_1_COMMUNITY=cliente_ciklo70
SNMP_CLIENT_EXPORT_1_GENERATORS=Ciklo70
```

- **`GENERATORS`**: lista separada por vírgula. Aceita o ID do gerador
  no banco, o `ip`/tópico (o que aparece como "Ciklo70") ou o
  `connectionName` — o que for mais fácil de identificar.
- Pode repetir para outros clientes: `SNMP_CLIENT_EXPORT_2_PORT=16102`,
  `_2_COMMUNITY=...`, `_2_GENERATORS=Ciklo55,Ciklo50` (pode ter mais de
  um gerador por export, se for o mesmo cliente).
- **Porta**: use uma porta dentro de **16101–16110** — essa faixa já
  vem publicada no `docker-compose.yml`. Se precisar de mais de 10
  exports, adicione outra faixa no compose e rode
  `docker-compose up -d api` (recreate) pra aplicar.
- Depois de mexer no `.env`, recrie o container pra valer
  (`docker restart` sozinho **não** relê o `.env`):
  ```bash
  docker rm -f ciklo-api
  docker-compose up -d api
  ```
- Libere no firewall só a porta daquele export, só para o IP do
  cliente: `ufw allow from <IP_DO_CLIENTE> to any port 16101 proto udp`.

Teste exatamente como o cliente vai testar:

```bash
snmptable -v2c -c cliente_ciklo70 <IP_DO_SERVIDOR>:16101 1.3.6.1.4.1.99999.1
```

Só aparece a linha do Ciklo70 — nenhum outro gerador da frota.

## 6. Somente leitura, sempre

Nenhuma coluna aceita `SET` — a tabela inteira é `MAX-ACCESS read-only`
e a comunidade só recebe nível `ReadOnly`. Não existe caminho para
controlar um gerador via SNMP.

## 6. Evolução futura (não implementado ainda)

- **SNMPv3** (usuário/senha em vez de community string em texto claro)
  — a biblioteca (`net-snmp`) já suporta via `authorizer.addUser(...)`,
  mas o agente atual só usa SNMPv2c/community. Avise se precisar.
- **Traps** de alarme (push em vez de polling) — hoje o cliente precisa
  consultar; dá para adicionar `agent.sendTrap(...)` quando um alarme
  abrir/fechar, se for necessário.
