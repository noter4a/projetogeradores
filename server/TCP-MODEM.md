# Modems serial-over-TCP (ex: USR-G806s)

Para modems que **não têm MQTT** e só falam **TCP transparente** (RS485 → socket TCP),
o backend tem uma ponte que os faz aparecerem para o sistema exatamente como um modem MQTT.
Polling, parsers, comandos e a remontagem de fragmentos funcionam sem nenhuma mudança.

## 1. Servidor

No `server/.env`, defina a porta da ponte (fica desligada se não definir):

```
TCP_BRIDGE_PORT=8900
```

A porta `8900` já está mapeada no `docker-compose.yml` (`0.0.0.0`, para o modem 4G alcançar).
Abra a porta no firewall do servidor:

```bash
ufw allow 8900/tcp    # ou a regra equivalente do seu provedor de nuvem
```

Suba de novo: `docker-compose up -d --build api`.

## 2. Cadastro do gerador (banco)

Cadastre o gerador **igual a um modem normal**: `deviceType = dr164`, o `controller` do
equipamento (ex: `agc150`), `slaveId`, e o campo **IP = o identificador lógico** (ex: `Ciklo51`).
Esse identificador é o que o modem vai mandar no pacote de registro.

## 3. Configuração do modem (USR-G806s)

Na interface web do modem (`192.168.1.1`, user/senha `root`/`root`):

**Serial (RS485)** — casar com o controlador:
- Baud rate / data bits / parity / stop bits **iguais aos dos outros modems** que já funcionam
  (o AGC150 costuma ser `9600 8N1`, mas confirme com um modem que já está no ar).

**Working mode / Socket** — modo transparente:
- Work mode: **TCP Client** (Net Transparent)
- Remote server: **IP público (ou domínio) do servidor** + porta **8900**
  (ex: `72.62.8.141:8900`)

**Registration package (pacote de registro)** — identifica o device:
- Habilitar registro
- Enviar: **ao conectar** (send on connect), *não* "a cada pacote"
- Tipo: **ASCII / custom**
- Valor: **o mesmo identificador do cadastro** (ex: `Ciklo51`)

**Heartbeat package:** **desabilitado** (o polling já mantém a conexão viva; heartbeat
injetaria bytes que não são Modbus).

## 4. Verificação

Nos logs do `ciklo-api` você deve ver, ao ligar o modem:

```
[TCP-BRIDGE] Listening for serial-over-TCP modems on 0.0.0.0:8900
[TCP-BRIDGE] New connection from <ip>:<porta> — awaiting registration package.
[TCP-BRIDGE] <ip> registered as "Ciklo51".
```

E, em seguida, as leituras normais (`[AGC150] [Ciklo51] Step 1/5 ...`, `Decoded ... data for Ciklo51`).

Se aparecer `first packet is not a valid registration id`, o pacote de registro do modem
está desligado ou mal configurado — revise o passo 3.
