// Catálogo único de todos os "Avisos" (severidade separada de Falha/ALARME)
// que o sistema é capaz de detectar hoje, por controlador. É uma lista de
// REFERÊNCIA para a tela de configuração — não decide nada sozinha; quem lê
// esse catálogo pra aplicar a política de opt-in é server/src/services/mqtt.js
// (via lib/companyWarnings.js), comparando contra companies.enabled_warnings.
//
// Os nomes aqui são os MESMOS que já existem nas tabelas de decodificação dos
// parsers (kva-parser.js AVISOS_H/AVISOS_L, sgc120-parser.js ALARM_DEFS,
// sgc420-parser.js ALARM_DEFS_420) — mudar um nome aqui sem mudar lá (ou
// vice-versa) quebra o casamento da chave. DSE e Cummins não têm tabela de
// avisos nomeados (só um flag/booleano geral cada), por isso têm 1 item cada.

export const CATEGORIES = [
    { id: 'REDE', label: 'Avisos de Rede' },
    { id: 'BATERIA', label: 'Avisos de Bateria/Carregador' },
    { id: 'COMBUSTIVEL', label: 'Avisos de Combustível' },
    { id: 'MOTOR_SENSORES', label: 'Avisos de Motor/Sensores' },
    { id: 'MANUTENCAO', label: 'Avisos de Manutenção' },
    { id: 'ELETRICO_GERADOR', label: 'Avisos Elétricos/Gerador' },
    { id: 'PARTIDA_PARADA', label: 'Avisos de Partida/Parada' },
    { id: 'EMERGENCIA', label: 'Parada de Emergência' },
    { id: 'ENTRADAS_AUX', label: 'Entradas Auxiliares' },
    { id: 'INDICADORES', label: 'Indicadores/Lâmpadas' },
    { id: 'GENERICO', label: 'Avisos Genéricos' },
];

export function buildWarningKey(controller, name) {
    return `${controller}:${name}`;
}

// { controller, name, category } — a `key` é derivada (controller:name), não
// precisa ser repetida aqui.
const RAW_ITEMS = [
    // ---- KVA (K30XTe / K30XL / Eclipse) — AVISOS_H + AVISOS_L, kva-parser.js ----
    { controller: 'KVA', name: 'Sequência de Fases da Rede', category: 'REDE' },
    { controller: 'KVA', name: 'Erro no Sensor de Combustível', category: 'COMBUSTIVEL' },
    { controller: 'KVA', name: 'CGR não Abre', category: 'PARTIDA_PARADA' },
    { controller: 'KVA', name: 'Manutenção Periódica Vencida', category: 'MANUTENCAO' },
    { controller: 'KVA', name: 'Erro no Pick-up', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Defeito no Carregador', category: 'BATERIA' },
    { controller: 'KVA', name: 'Bateria descarregada', category: 'BATERIA' },
    { controller: 'KVA', name: 'Nível de Combustível Baixo', category: 'COMBUSTIVEL' },
    { controller: 'KVA', name: 'Motor Frio - Aquecendo', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Sem sensor de pressão do óleo', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Erro no sensor de pressão do óleo', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Erro no Pressostato', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Sem sensor de temperatura', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Erro no sensor de temperatura', category: 'MOTOR_SENSORES' },
    { controller: 'KVA', name: 'Fora do Horário de Serviço', category: 'PARTIDA_PARADA' },
    { controller: 'KVA', name: 'CRD não Fecha', category: 'PARTIDA_PARADA' },
    { controller: 'KVA', name: 'Partida Inibida (Feriado)', category: 'PARTIDA_PARADA' },

    // ---- SGC-120 (DEIF) — ALARM_DEFS (registradores 65-76), sgc120-parser.js ----
    // Qualquer um destes pode aparecer em nível 1 (aviso) OU 2/3 (falha) —
    // "Falha Aquecimento ECU" fica de fora (ignorada permanentemente no parser,
    // alarme fantasma conhecido).
    { controller: 'SGC120', name: 'Baixa Pressão Óleo', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Alta Temp. Motor', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Baixo Nível Combustível', category: 'COMBUSTIVEL' },
    { controller: 'SGC120', name: 'Nível de Água', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Subvelocidade', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Sobrevelocidade', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Falha na Partida', category: 'PARTIDA_PARADA' },
    { controller: 'SGC120', name: 'Falha na Parada', category: 'PARTIDA_PARADA' },
    { controller: 'SGC120', name: 'Potência Reversa', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Baixa Carga', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Baixa Frequência Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Alta Frequência Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Alta Corrente Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Sobrecarga Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Carga Desbalanceada', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Parada de Emergência', category: 'EMERGENCIA' },
    { controller: 'SGC120', name: 'Falha Alt. de Carga', category: 'BATERIA' },
    { controller: 'SGC120', name: 'Manutenção Prox.', category: 'MANUTENCAO' },
    { controller: 'SGC120', name: 'Timeout AFT', category: 'MANUTENCAO' },
    { controller: 'SGC120', name: 'Manutenção Filtro Cinzas', category: 'MANUTENCAO' },
    { controller: 'SGC120', name: 'Baixa Tensão Bateria', category: 'BATERIA' },
    { controller: 'SGC120', name: 'Alta Tensão Bateria', category: 'BATERIA' },
    { controller: 'SGC120', name: 'Circ. Temp Aberto', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Pressão Óleo / Curto Bat.', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Roubo de Combustível', category: 'COMBUSTIVEL' },
    { controller: 'SGC120', name: 'Falha Pick-up Mag.', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Circ. Pressão Óleo Aberto', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Entrada Aux. A', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. B', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. C', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. D', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. E', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. F', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. G', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. H', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Entrada Aux. I', category: 'ENTRADAS_AUX' },
    { controller: 'SGC120', name: 'Baixa Tensão Ger. L1', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Alta Tensão Ger. L1', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Baixa Tensão Ger. L2', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Alta Tensão Ger. L2', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Baixa Tensão Ger. L3', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Alta Tensão Ger. L3', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Rotação Fase Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC120', name: 'Rotação Fase Rede', category: 'REDE' },
    { controller: 'SGC120', name: 'Circ. Combustível Aberto', category: 'COMBUSTIVEL' },
    { controller: 'SGC120', name: 'Correia Quebrada', category: 'MOTOR_SENSORES' },
    { controller: 'SGC120', name: 'Alta Pressão Óleo Detc.', category: 'MOTOR_SENSORES' },

    // ---- SGC-420 (DEIF) — ALARM_DEFS_420 (registradores 72-85), sgc420-parser.js ----
    { controller: 'SGC420', name: 'Baixa Pressão Óleo', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Alta Temp. Motor', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Baixo Nível Combustível', category: 'COMBUSTIVEL' },
    { controller: 'SGC420', name: 'Nível de Água', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Subvelocidade', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Sobrevelocidade', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Falha na Partida', category: 'PARTIDA_PARADA' },
    { controller: 'SGC420', name: 'Falha na Parada', category: 'PARTIDA_PARADA' },
    { controller: 'SGC420', name: 'Circ. Temp Abrigo Aberto', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Alta Temp. Abrigo', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Baixa Frequência Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Alta Frequência Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Alta Corrente Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Sobrecarga Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Carga Desbalanceada', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Parada de Emergência', category: 'EMERGENCIA' },
    { controller: 'SGC420', name: 'Falha Alt. de Carga', category: 'BATERIA' },
    { controller: 'SGC420', name: 'Manutenção Filtro Óleo', category: 'MANUTENCAO' },
    { controller: 'SGC420', name: 'Lâmpada MIL', category: 'INDICADORES' },
    { controller: 'SGC420', name: 'Lâmpada Vermelha', category: 'INDICADORES' },
    { controller: 'SGC420', name: 'Baixa Tensão Bateria', category: 'BATERIA' },
    { controller: 'SGC420', name: 'Alta Tensão Bateria', category: 'BATERIA' },
    { controller: 'SGC420', name: 'Circ. Temp Motor Aberto', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Potência Reversa', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Roubo de Combustível', category: 'COMBUSTIVEL' },
    { controller: 'SGC420', name: 'Falha Pick-up Mag.', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Circ. Pressão Óleo Aberto', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Baixa Tensão Ger. L1', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Alta Tensão Ger. L1', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Baixa Tensão Ger. L2', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Alta Tensão Ger. L2', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Baixa Tensão Ger. L3', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Alta Tensão Ger. L3', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Rotação Fase Ger.', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Rotação Fase Rede', category: 'REDE' },
    { controller: 'SGC420', name: 'Baixa Carga', category: 'ELETRICO_GERADOR' },
    { controller: 'SGC420', name: 'Correia Quebrada', category: 'MOTOR_SENSORES' },
    { controller: 'SGC420', name: 'Circ. Combustível Aberto', category: 'COMBUSTIVEL' },
    { controller: 'SGC420', name: 'Alta Pressão Óleo Detc.', category: 'MOTOR_SENSORES' },

    // ---- DSE e Cummins — sem tabela de avisos nomeados (só um flag geral cada) ----
    { controller: 'DSE', name: 'Aviso Genérico', category: 'GENERICO' },
    { controller: 'CUMMINS', name: 'Aviso Genérico', category: 'GENERICO' },
];

export const WARNING_CATALOG = RAW_ITEMS.map(item => ({
    ...item,
    key: buildWarningKey(item.controller, item.name),
}));

// Agrupado por categoria, na ordem de CATEGORIES — formato que a tela de
// configuração e a rota GET /api/company-warnings/catalog consomem direto.
export function getCatalogGroupedByCategory() {
    return CATEGORIES.map(cat => ({
        ...cat,
        items: WARNING_CATALOG.filter(item => item.category === cat.id),
    })).filter(group => group.items.length > 0);
}

// Set com todas as keys válidas — usado pra validar o PUT (ignora/rejeita
// keys desconhecidas em vez de gravar lixo em companies.enabled_warnings).
export const VALID_WARNING_KEYS = new Set(WARNING_CATALOG.map(item => item.key));

// Todos os códigos de controlador que aparecem no catálogo (derivado, não
// precisa listar de novo à mão) — usado pra saber se um controlador tem
// Avisos suportados antes de exibir a tela de configuração pra ele.
export const CATALOG_CONTROLLER_CODES = new Set(WARNING_CATALOG.map(item => item.controller));

// Mapeia o valor cru salvo em generators.connection_info.controller (o que o
// formulário de cadastro grava, ex.: 'deif', 'kvar', 'sgc420') pro código do
// catálogo ('SGC120', 'KVA', ...). Controladores sem Avisos implementados
// (AGC150, ComAp) ou desconhecidos retornam null.
export function mapRawControllerToCatalogCode(rawController) {
    const c = (rawController || '').toLowerCase();
    if (c === 'dse') return 'DSE';
    if (c === 'kva' || c === 'kvar') return 'KVA';
    if (c === 'cummins' || c === 'pcc1301' || c === 'powercommand') return 'CUMMINS';
    if (c === 'sgc420' || c === 'deif420' || c === 'deif_sgc420') return 'SGC420';
    if (c === 'deif') return 'SGC120';
    return null; // agc150, comap, deif150/agc150 variants, vazio, etc — sem catálogo de Avisos
}
