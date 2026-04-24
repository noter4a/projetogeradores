import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { QmProposal } from '../../types';

const ProposalView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<QmProposal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProposal = async () => {
      try {
        const token = localStorage.getItem('ciklo_auth_token');
        const res = await fetch(`/api/proposals/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setProposal(await res.json());
        } else {
          alert('Proposta não encontrada');
          navigate('/sales/proposals');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProposal();
  }, [id, navigate]);

  if (loading) {
    return <div className="text-white text-center py-10">Carregando documento...</div>;
  }

  if (!proposal) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const cliente = proposal.cliente;
  const gerador = proposal.gerador;
  return (
    <div className="bg-gray-200 min-h-screen py-4 sm:py-8 print:bg-white print:py-0 text-black font-sans overflow-x-auto">
      <style>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          body { margin: 0; padding: 0; }

          /* Header e Footer fixos aparecem em TODAS as páginas */
          .print-letterhead-header {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            z-index: 1000;
          }
          .print-letterhead-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            z-index: 1000;
          }

          /* Esconde os elementos de preview da timbrada (só usa os fixos) */
          .preview-header,
          .preview-footer { display: none; }

          /* Conteúdo com margem para não sobrepor header/footer */
          .proposal-content {
            margin-top: 35mm;
            margin-bottom: 45mm;
            padding-left: 15mm;
            padding-right: 15mm;
          }

          /* Evita corte no meio de parágrafos e itens de lista */
          .proposal-content p,
          .proposal-content li,
          .proposal-content div {
            orphans: 3;
            widows: 3;
          }

          .proposal-a4 {
            width: 210mm !important;
            box-shadow: none !important;
            margin: 0 !important;
            background: white !important;
          }
        }
      `}</style>
      
      {/* No-Print Actions Bar */}
      <div className="max-w-[210mm] mx-auto mb-4 flex flex-wrap justify-between items-center gap-2 print:hidden px-2 sm:px-0">
        <button onClick={() => navigate('/sales/proposals')} className="flex items-center gap-2 bg-gray-800 text-white px-3 py-2 rounded shadow hover:bg-gray-700 text-sm">
          <ArrowLeft size={16} /> Voltar
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-ciklo-orange text-white px-3 py-2 rounded shadow font-bold hover:bg-orange-600 text-sm">
          <Printer size={16} /> Imprimir / PDF
        </button>
      </div>

      {/* Elementos FIXOS para impressão - aparecem em todas as páginas */}
      <img src="/timbrada_header.png" alt="" className="print-letterhead-header hidden print:block" />
      <img src="/timbrada_footer.png" alt="" className="print-letterhead-footer hidden print:block" />

      {/* A4 Document Wrapper */}
      <div className="proposal-a4 bg-white mx-auto shadow-2xl print:shadow-none flex flex-col"
        style={{ width: '210mm' }}>

        {/* Preview Header (só aparece na tela) */}
        <img src="/timbrada_header.png" alt="" className="preview-header w-full print:hidden" />

        {/* Content area */}
        <div className="proposal-content flex-1 px-[15mm] py-4">

        {/* Header Block */}
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1 text-sm font-semibold">
            <div>PROPOSTA: {proposal.numero_proposta}</div>
          </div>
          <div className="space-y-1 text-sm text-right">
            <div>DATA EMISSÃO: {formatDate(proposal.data_emissao)}</div>
          </div>
        </div>

        {/* Client Block */}
        <div className="border border-black p-3 mb-6 text-sm">
          <div className="font-bold border-b border-gray-300 pb-1 mb-2">DADOS DO CLIENTE</div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="font-bold">NOME / RAZÃO SOCIAL:</span> {cliente?.razao_social || '-'}</div>
            <div><span className="font-bold">CNPJ/CPF:</span> {cliente?.cnpj_cpf || '-'}</div>
            <div><span className="font-bold">IE:</span> {cliente?.ie || '-'}</div>
            <div><span className="font-bold">ENDEREÇO:</span> {cliente?.endereco || '-'}</div>
            <div><span className="font-bold">BAIRRO/DISTRITO:</span> {cliente?.bairro || '-'}</div>
            <div><span className="font-bold">CEP:</span> {cliente?.cep || '-'}</div>
            <div><span className="font-bold">MUNICÍPIO:</span> {cliente?.municipio || '-'} UF: {cliente?.uf || '-'}</div>
            <div><span className="font-bold">CONTATO:</span> {cliente?.contato || '-'}</div>
            <div><span className="font-bold">FONES:</span> {cliente?.fones || '-'}</div>
            <div><span className="font-bold">EMAIL:</span> {cliente?.email || '-'}</div>
            <div className="col-span-2"><span className="font-bold">REPRESENTANTE:</span> {cliente?.representante || '-'}</div>
          </div>
        </div>

        {/* Intro Text */}
        <p className="text-sm text-justify mb-6">
          A <strong>CIKLO INDÚSTRIA E COMÉRCIO DE GERADORES LTDA</strong>, atendendo à sua estimada solicitação e de acordo com os dados informados por V. Sa., tem a satisfação de lhe apresentar, para análise, a proposta abaixo:
        </p>

        {/* 1. Produto Summary */}
        <div className="mb-4">
          <div className="font-bold text-sm bg-gray-200 p-1 border border-black inline-block px-4 mb-2">1. PRODUTO - {gerador?.modelo?.toUpperCase()}</div>
          <table className="w-full text-sm border-collapse border border-black text-center mb-6">
            <thead>
              <tr className="bg-gray-100 font-bold border border-black">
                <th className="border border-black p-1">ITEM</th>
                <th className="border border-black p-1">QT</th>
                <th className="border border-black p-1">UNID</th>
                <th className="border border-black p-1">DESCRIÇÃO</th>
                <th className="border border-black p-1 whitespace-nowrap">VLR. UNIT</th>
                <th className="border border-black p-1 whitespace-nowrap">VLR. TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-2 align-top">1</td>
                <td className="border border-black p-2 align-top">{proposal.quantidade}</td>
                <td className="border border-black p-2 align-top">{gerador?.unidade || 'UN'}</td>
                <td className="border border-black p-2 text-left whitespace-pre-wrap">
                  {gerador?.descricao || gerador?.modelo}{proposal.tensao ? `,
${proposal.tensao.descricao}` : ''}
                </td>
                <td className="border border-black p-2 align-top">{formatCurrency(gerador?.valor_unitario)}</td>
                <td className="border border-black p-2 align-top">{formatCurrency(proposal.valor_total)}</td>
              </tr>
              <tr className="font-bold bg-gray-100">
                <td colSpan={5} className="border border-black p-2 text-right">TOTAL</td>
                <td className="border border-black p-2">{formatCurrency(proposal.valor_total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-4 text-sm mb-6">
          {/* Observações */}
          {proposal.outros_acessorios && (
            <div>
              <div className="font-bold underline mb-1">Observações:</div>
              <div className="whitespace-pre-wrap pl-2">{proposal.outros_acessorios}</div>
            </div>
          )}

          {/* Gerador Protections */}
          {gerador?.protecao && (
            <div>
              <div className="font-bold underline mb-1">Proteções do gerador</div>
              <div className="whitespace-pre-wrap pl-2">{gerador.protecao}</div>
            </div>
          )}

          {/* Motor */}
          {proposal.motor && (
            <div>
              <div className="font-bold underline mb-1">1.1 MOTOR: {proposal.motor.modelo}</div>
              <div className="whitespace-pre-wrap pl-2 mb-2">{proposal.motor.descricao}</div>
              {proposal.motor.protecao && (
                <>
                  <div className="font-bold italic text-[13px] mb-1">Proteções do motor:</div>
                  <div className="whitespace-pre-wrap pl-2">{proposal.motor.protecao}</div>
                </>
              )}
            </div>
          )}

          {/* Alternator */}
          {proposal.alternador && (
            <div>
              <div className="font-bold underline mb-1">1.2 ALTERNADOR: {proposal.alternador.modelo}</div>
              <div className="whitespace-pre-wrap pl-2">{proposal.alternador.descricao}</div>
            </div>
          )}

          {/* Module */}
          {proposal.modulo && (
            <div>
              <div className="font-bold underline mb-1">1.3 MÓDULO: {proposal.modulo.modelo}</div>
              <div className="whitespace-pre-wrap pl-2 mb-2">{proposal.modulo.descricao}</div>
              {proposal.modulo.imagem_base64 && (
                <div className="mt-2 mb-2 flex justify-center">
                  <img
                    src={proposal.modulo.imagem_base64}
                    alt="Imagem do Módulo"
                    className="max-w-full max-h-[180px] object-contain border border-gray-300 rounded"
                  />
                </div>
              )}
            </div>
          )}

          {/* Accessories */}
          {proposal.acessorio && (
            <div>
              <div className="font-bold underline mb-1">1.4 ACESSÓRIOS: {proposal.acessorio.grupo}</div>
              <div className="whitespace-pre-wrap pl-2">{proposal.acessorio.itens_incluidos}</div>
            </div>
          )}

          {/* Dimensions */}
          {proposal.dimensao && (
            <div>
              <div className="font-bold underline mb-1">DIMENSÕES: {proposal.dimensao.id_dimensionamento}</div>
              <div className="whitespace-pre-wrap pl-2 mb-2">{proposal.dimensao.dimensoes}</div>
              {proposal.dimensao.imagem_base64 && (
                <div className="mt-2 mb-2 flex justify-center">
                  <img
                    src={proposal.dimensao.imagem_base64}
                    alt="Imagem do Dimensionamento"
                    className="max-w-full max-h-[220px] object-contain border border-gray-300 rounded"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Break page visually if it gets too long, though CSS controls print pages naturally */}
        <hr className="border-t-2 border-gray-400 my-6" />

        {/* Footer Conditions */}
        <div className="space-y-4 text-sm mb-6">
          <div>
            <div className="font-bold underline mb-1 text-center">CONSIDERAÇÕES GERAIS</div>
            <p className="text-justify">
              O escopo de fornecimento da Ciklo Geradores foi elaborado conforme informações enviadas por V.Sa., se limitando inteiramente aos itens descritos nesta, não constituindo no fornecimento de energia. Na eventual indisponibilidade de funcionamento dos equipamentos, a Ciklo Geradores não retrata nenhuma forma de ressarcimento por lucros cessantes e/ou perdas e danos ao cliente e/ou terceiros.
            </p>
          </div>

          <div>
            <div className="font-bold underline mb-1 text-center">GARANTIA</div>
            <p className="text-justify">
              A garantia é de 1 (um) ano, ou 1.000 (mil) horas de uso (ou) o que vencer primeiro após a emissão da nota fiscal de acordo com o Código de Defesa do consumidor.
            </p>
          </div>

          <div>
            <div className="font-bold underline mb-1 text-center">DIFAL (Diferença de Alíquota do ICMS)</div>
            <p className="text-justify">
              Valor não incluso na proposta. Caso haja incidência de DIFAL, o mesmo será de responsabilidade do cliente, conforme legislação vigente.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-y-2 text-[13px] border-t border-b border-gray-300 py-3">
             <div className="font-bold">VALIDADE DA PROPOSTA:</div>
             <div className="col-span-2">{formatDate(proposal.valido_ate)}</div>

             <div className="font-bold">PRAZO DE ENTREGA:</div>
             <div className="col-span-2">{proposal.prazo_entrega || '-'}</div>

             <div className="font-bold">FORMA DE PAGAMENTO:</div>
             <div className="col-span-2">{proposal.forma_pagamento || '-'}</div>
             <div></div>
             <div className="col-span-2 italic text-[12px] text-gray-600 -mt-1">Em caso de parcelamento, será sujeito a análise de crédito.</div>

             <div className="font-bold">FRETE:</div>
             <div className="col-span-2">{proposal.frete || '-'}</div>

             <div className="font-bold">IPI:</div>
             <div className="col-span-2">{proposal.ipi || '-'}</div>

             <div className="font-bold">ICMS:</div>
             <div className="col-span-2">{proposal.icms ? `${proposal.icms}%` : '-'}</div>

             <div className="font-bold">CÓDIGO FINAME:</div>
             <div className="col-span-2">{gerador?.finame || '-'}</div>

             <div className="font-bold">CÓDIGO MDA:</div>
             <div className="col-span-2">{gerador?.mda || '-'}</div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="text-xs mb-8">
           <div className="font-bold underline mb-2 text-center text-sm">DADOS BANCÁRIOS PARA DEPÓSITO</div>
           <div className="text-center font-bold mb-2">CIKLO INDÚSTRIA E COMÉRCIO DE GERADORES LTDA - CNPJ: 17.206.381/0001-62</div>
           <div className="flex justify-center gap-10">
              <div>
                <strong>Banco do Brasil</strong><br/>
                Ag: 0669-6<br/>
                C/C: 12.396-X<br/>
                PIX: ciklo@ciklogeradores.com.br
              </div>
              <div>
                <strong>Sicredi (748)</strong><br/>
                Ag: 0259<br/>
                C/C: 34.700-00<br/>
                PIX: 17.206.381/0001-62
              </div>
           </div>
        </div>

        {/* Signatures */}
        <div className="text-sm text-center mb-10">
          <p>Estamos à disposição para quaisquer dúvidas/esclarecimentos. Atenciosamente,</p>
        </div>

        <div className="flex justify-between items-end mt-16 px-10 text-sm">
           <div className="text-center flex-1">
             <div className="border-t border-black pt-1 px-8 inline-block">Representante / Ciklo</div>
           </div>
           <div className="text-center flex-1">
             <div className="border-t border-black pt-1 px-8 inline-block">Cliente / comprador</div>
           </div>
        </div>
        
        <div className="mt-8 text-xs text-justify italic px-4 border-t border-gray-300 pt-4">
          Eu, ______________________________________________________ DECLARO expressamente a intenção de adquirir o grupo gerador, e ACEITO as especificações do presente orçamento, comprometendo-me com todos os termos acima expostos. <br/><br/> Data: ____/____/_____
        </div>
        </div>

        {/* Preview Footer (só aparece na tela) */}
        <img src="/timbrada_footer.png" alt="" className="preview-footer w-full mt-auto print:hidden" />
      </div>
    </div>
  );
};

export default ProposalView;
