const GOOGLE_API_KEY = "AIzaSyA-J4VenGoCiQeI3qX1NECd7hebwM7X4As";
const CRM_API_URL = "https://lhc.webplanet.com.br/zap3stor/restapi/opportunities";
const CRM_AUTH_TOKEN = "YWRtaW46V2VibmUxMA==";

interface Place {
  name: string;
  place_id: string;
  formatted_address: string;
}

interface PlaceDetails extends Place {
  website?: string;
  formatted_phone_number?: string;
}

interface LeadSemSite {
  nome: string;
  endereco: string;
  telefone: string;
  placeId: string;
}

interface LeadComSite {
  nome: string;
  site: string;
  telefone: string;
  notaSeo: number | null;
  placeId: string;
}

async function searchPlaces(query: string, maxPages = 3): Promise<Place[]> {
  let allPlaces: Place[] = [];
  let nextPageToken: string | undefined = undefined;
  let pagesFetched = 0;

  do {
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&key=${GOOGLE_API_KEY}`;

    if (nextPageToken) {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${GOOGLE_API_KEY}`;
      await Bun.sleep(2000);
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error(`\n❌ Erro Busca: Status ${data.status}`);
      if (data.error_message) console.error(data.error_message);
      break;
    }

    if (data.results) {
      allPlaces = allPlaces.concat(data.results);
    }

    nextPageToken = data.next_page_token;
    pagesFetched++;
  } while (nextPageToken && pagesFetched < maxPages);

  return allPlaces;
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,website,formatted_address,formatted_phone_number&key=${GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK") {
    console.error(`\n❌ Erro Detalhes: Status ${data.status}`);
    if (data.error_message) console.error(data.error_message);
  }

  return data.result || {};
}

async function runSeoTest(url: string): Promise<number | null> {
  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&category=seo&key=${GOOGLE_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.error) return null;
    return data.lighthouseResult?.categories?.seo?.score * 100 || null;
  } catch (error) {
    return null;
  }
}

async function generateLeadsReport(searchQuery: string) {
  const places = await searchPlaces(searchQuery);
  const leadsSemSite: LeadSemSite[] = [];
  const leadsComSiteParaOtimizar: LeadComSite[] = [];

  for (const place of places) {
    await Bun.sleep(200);
    const details = await getPlaceDetails(place.place_id);

    if (!details.website) {
      leadsSemSite.push({
        nome: details.name,
        endereco: details.formatted_address,
        telefone: details.formatted_phone_number || "Não informado",
        placeId: place.place_id,
      });
    } else {
      const seoScore = await runSeoTest(details.website);
      leadsComSiteParaOtimizar.push({
        nome: details.name,
        site: details.website,
        telefone: details.formatted_phone_number || "Não informado",
        notaSeo: seoScore,
        placeId: place.place_id,
      });
    }
  }

  return { semSite: leadsSemSite, comSite: leadsComSiteParaOtimizar };
}

Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/salvar-crm" && req.method === "POST") {
      try {
        const lead = await req.json();

        const payload = {
          name: lead.nome,
          company: lead.nome,
          phone: lead.telefone,
          status: 0,
          observation: `Endereço: ${lead.endereco || "N/A"}\nSite: ${
            lead.site || "N/A"
          }\nNota SEO: ${lead.notaSeo || "N/A"}\nOrigem: Gerador de Leads Maps`,
        };

        const crmResponse = await fetch(CRM_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${CRM_AUTH_TOKEN}`,
          },
          body: JSON.stringify(payload),
        });

        const crmData = await crmResponse.json();

        if (!crmResponse.ok || crmData.error === true) {
          console.error(
            `\n❌ [ERRO CRM]:`,
            crmData.result || "Falha desconhecida"
          );
          return new Response(
            JSON.stringify({
              error: true,
              message: crmData.result || "Erro na API do CRM",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return Response.json({ success: true });
      } catch (error) {
        console.error("\n❌ [ERRO SERVIDOR BUN]:", error, "\n");
        return new Response(
          JSON.stringify({
            error: true,
            message: "Erro de comunicação com o Zap3stor",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/api/buscar-leads" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.keyword)
          return new Response("Keyword is required", { status: 400 });

        const searchQuery = body.cidade
          ? `${body.keyword} em ${body.cidade}`
          : body.keyword;
        const relatorio = await generateLeadsReport(searchQuery);

        return Response.json(relatorio);
      } catch (error) {
        return new Response("Erro interno do servidor", { status: 500 });
      }
    }

    if (url.pathname === "/") {
      return new Response(
        `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Gerador de Leads Maps</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 p-10 font-sans">
          
          <!-- MODAL WHATSAPP -->
          <div id="whats-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg relative">
              <h3 class="text-xl font-bold mb-4 text-gray-800">Escolha a mensagem para <br><span id="modal-lead-name" class="text-blue-600"></span></h3>
              
              <div class="space-y-3">
                <button onclick="enviarWhats('semsite')" class="w-full text-left p-3 border border-gray-200 rounded hover:bg-gray-50 transition flex flex-col gap-1">
                  <span class="font-bold text-gray-800">🚨 Sem Site</span>
                  <span class="text-xs text-gray-500 line-clamp-2">"Estava analisando a presença digital... reparei que vocês não têm um site..."</span>
                </button>
                
                <button onclick="enviarWhats('fora')" class="w-full text-left p-3 border border-gray-200 rounded hover:bg-gray-50 transition flex flex-col gap-1">
                  <span class="font-bold text-gray-800">🌐 Site Fora do Ar</span>
                  <span class="text-xs text-gray-500 line-clamp-2">"Estava analisando a presença digital... reparei que o seu site estava fora do ar..."</span>
                </button>

                <button onclick="enviarWhats('ruim')" class="w-full text-left p-3 border border-gray-200 rounded hover:bg-gray-50 transition flex flex-col gap-1">
                  <span class="font-bold text-gray-800">📉 Site Mal Desenvolvido (SEO Baixo)</span>
                  <span class="text-xs text-gray-500 line-clamp-2">"Estava analisando a presença digital... reparei que o site de vocês apresenta falhas de otimização..."</span>
                </button>
              </div>

              <button onclick="fecharModal()" class="mt-6 w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded transition">
                Cancelar
              </button>
            </div>
          </div>

          <div class="max-w-6xl mx-auto bg-white p-8 rounded-lg shadow-md">
            <div class="flex justify-between items-center mb-6">
              <h1 class="text-3xl font-bold text-gray-800">Prospecção de Leads</h1>
              <button onclick="exportarCSV()" id="btn-csv" class="hidden bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700 transition">
                📥 Exportar CSV
              </button>
            </div>
            
            <div class="flex flex-col md:flex-row gap-4 mb-8">
              <input type="text" id="keyword" placeholder="O que buscar? (Ex: Clínica Veterinária)" class="flex-1 border border-gray-300 rounded px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <input type="text" id="cidade" placeholder="Onde? (Ex: Canoas)" value="Porto Alegre" class="flex-1 border border-gray-300 rounded px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <button onclick="buscar()" id="btn-buscar" class="bg-blue-600 text-white px-8 py-3 rounded text-lg hover:bg-blue-700 font-semibold transition whitespace-nowrap">
                Buscar Leads
              </button>
            </div>

            <div id="loading" class="hidden flex items-center gap-3 text-blue-600 font-semibold mb-4 animate-pulse">
              <svg class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Varrendo até 60 empresas e testando SEO. Isso pode levar alguns minutos...
            </div>

            <div id="resultados" class="hidden grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
              <div>
                <h2 class="text-2xl font-bold text-red-600 mb-4 flex items-center gap-2">🚨 Sem Site <span id="count-sem-site" class="text-sm bg-red-100 text-red-800 py-1 px-2 rounded-full"></span></h2>
                <div id="lista-sem-site" class="space-y-4"></div>
              </div>

              <div>
                <h2 class="text-2xl font-bold text-green-600 mb-4 flex items-center gap-2">📈 Com Site (SEO) <span id="count-com-site" class="text-sm bg-green-100 text-green-800 py-1 px-2 rounded-full"></span></h2>
                <div id="lista-com-site" class="space-y-4"></div>
              </div>
            </div>
          </div>

          <script>
            let leadsGlobais = { semSite: [], comSite: [] };
            let leadAtualWhats = { nome: '', telefone: '' };

            function formatarTelefone(tel) {
              return tel.replace(/\\D/g, '');
            }

            function abrirModalWhats(nome, telefone) {
              leadAtualWhats = { nome, telefone };
              document.getElementById('modal-lead-name').textContent = nome;
              document.getElementById('whats-modal').classList.remove('hidden');
            }

            function fecharModal() {
              document.getElementById('whats-modal').classList.add('hidden');
            }

            function enviarWhats(tipo) {
              const { nome, telefone } = leadAtualWhats;
              let msg = '';
              
              if(tipo === 'semsite') {
                msg = \`Oi \${nome}, tudo bem? Me chamo Beatriz e trabalho com desenvolvimento web. Estava analisando a presença digital de negócios locais e reparei que vocês não têm um site no Google e podem estar perdendo clientes por isso. Teria interesse em receber uma proposta rápida? Segue meu portfólio: https://beatrizamaral.vercel.app/\`;
              } else if(tipo === 'fora') {
                msg = \`Oi \${nome}, tudo bem? Me chamo Beatriz e trabalho com desenvolvimento web. Estava analisando a presença digital de negócios locais e reparei que o seu site estava fora do ar e podem estar perdendo clientes por isso. Teria interesse em receber uma proposta rápida? Segue meu portfólio: https://beatrizamaral.vercel.app/\`;
              } else if(tipo === 'ruim') {
                msg = \`Oi \${nome}, tudo bem? Me chamo Beatriz e trabalho com desenvolvimento web. Estava analisando a presença digital de negócios locais e reparei que o site de vocês apresenta falhas de otimização que fazem a empresa perder posições de busca no Google. Teria interesse em receber uma proposta de melhoria rápida? Segue meu portfólio: https://beatrizamaral.vercel.app/\`;
              }

              const isBR = telefone.startsWith('55') ? telefone : '55' + telefone;
              const waUrl = \`https://wa.me/\${isBR}?text=\${encodeURIComponent(msg)}\`;
              
              window.open(waUrl, '_blank');
              fecharModal();
            }

            async function salvarCRM(btn, leadData) {
              const textoOriginal = btn.innerHTML;
              btn.innerHTML = '⏳ Salvando...';
              btn.disabled = true;

              try {
                const res = await fetch('/api/salvar-crm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(leadData)
                });

                const data = await res.json();

                if (res.ok && !data.error) {
                  btn.innerHTML = '✅ No CRM';
                  btn.classList.replace('bg-purple-100', 'bg-green-100');
                  btn.classList.replace('text-purple-700', 'text-green-800');
                } else {
                  alert('Erro retornado pelo CRM:\\n\\n' + (data.message || 'Falha desconhecida.'));
                  btn.innerHTML = '❌ Erro';
                  setTimeout(() => {
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                  }, 2000);
                }
              } catch (e) {
                alert('Erro de rede ou comunicação com o servidor Bun.');
                btn.innerHTML = '❌ Erro';
                setTimeout(() => {
                  btn.innerHTML = textoOriginal;
                  btn.disabled = false;
                }, 2000);
              }
            }

            function exportarCSV() {
              let csvContent = "data:text/csv;charset=utf-8,Nome,Telefone,Endereço,Site,Nota SEO,Status\\n";
              
              leadsGlobais.semSite.forEach(lead => {
                csvContent += \`"\${lead.nome}","\${lead.telefone}","\${lead.endereco}","N/A","N/A","Sem Site"\\n\`;
              });
              
              leadsGlobais.comSite.forEach(lead => {
                csvContent += \`"\${lead.nome}","\${lead.telefone}","N/A","\${lead.site}","\${lead.notaSeo || 'N/A'}","Com Site"\\n\`;
              });

              const encodedUri = encodeURI(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", "leads_prospeccao.csv");
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }

            function createCard(lead, tipo) {
              const mapsUrl = \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(lead.nome)}&query_place_id=\${lead.placeId}\`;
              const leadJson = JSON.stringify(lead).replace(/'/g, "\\\\'");
              const nomeSafe = lead.nome.replace(/'/g, "\\\\'");
              const telLimpo = formatarTelefone(lead.telefone);

              let extraInfo = '';
              if (tipo === 'semsite') {
                extraInfo = \`<p class="text-sm text-gray-600 mt-2">📍 \${lead.endereco}</p>\`;
              } else {
                const seoColor = lead.notaSeo < 50 ? 'text-red-600' : lead.notaSeo < 80 ? 'text-yellow-600' : 'text-green-600';
                const seoText = lead.notaSeo ? \`<span class="font-bold \${seoColor}">\${lead.notaSeo}/100</span>\` : '<span class="text-gray-400">N/A</span>';
                
                extraInfo = \`
                  <div class="mt-3 pt-3 border-t border-gray-200">
                    <p class="text-sm text-blue-600 truncate"><a href="\${lead.site}" target="_blank" class="hover:underline">🌐 \${lead.site}</a></p>
                    <p class="text-sm text-gray-600 mt-1">🎯 Desempenho SEO: \${seoText}</p>
                  </div>
                \`;
              }

              return \`
                <div class="bg-gray-50 border border-gray-200 p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow relative">
                  <h3 class="font-bold text-lg text-gray-800 pr-24">\${lead.nome}</h3>
                  <p class="text-md text-gray-700 font-medium mt-1">📞 \${lead.telefone}</p>
                  
                  <div class="flex gap-2 mt-3">
                    \${lead.telefone !== 'Não informado' ? \`
                      <button onclick="abrirModalWhats('\${nomeSafe}', '\${telLimpo}')" class="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1.5 rounded transition font-semibold">
                        💬 Chamar Whats
                      </button>
                    \` : ''}
                    <button onclick='salvarCRM(this, \${leadJson})' class="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded transition font-semibold">
                      📥 Salvar no CRM
                    </button>
                  </div>
                  
                  \${extraInfo}
                  
                  <a href="\${mapsUrl}" target="_blank" class="absolute top-5 right-5 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-blue-200 transition">
                    Ver Perfil
                  </a>
                </div>
              \`;
            }

            async function buscar() {
              const keyword = document.getElementById('keyword').value;
              const cidade = document.getElementById('cidade').value;
              
              if (!keyword) return alert('Digite um ramo para pesquisar!');

              document.getElementById('loading').classList.remove('hidden');
              document.getElementById('resultados').classList.add('hidden');
              document.getElementById('btn-csv').classList.add('hidden');
              document.getElementById('btn-buscar').disabled = true;

              try {
                const res = await fetch('/api/buscar-leads', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ keyword, cidade })
                });
                
                const data = await res.json();
                leadsGlobais = data;
                
                document.getElementById('count-sem-site').textContent = data.semSite.length;
                document.getElementById('count-com-site').textContent = data.comSite.length;

                document.getElementById('lista-sem-site').innerHTML = data.semSite.length > 0 
                  ? data.semSite.map(lead => createCard(lead, 'semsite')).join('')
                  : '<p class="text-gray-500 italic">Nenhuma empresa sem site encontrada.</p>';

                document.getElementById('lista-com-site').innerHTML = data.comSite.length > 0
                  ? data.comSite.map(lead => createCard(lead, 'comsite')).join('')
                  : '<p class="text-gray-500 italic">Nenhuma empresa com site encontrada.</p>';

                document.getElementById('resultados').classList.remove('hidden');
                document.getElementById('btn-csv').classList.remove('hidden');
              } catch (e) {
                alert('Erro ao buscar dados.');
              } finally {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('btn-buscar').disabled = false;
              }
            }
          </script>
        </body>
        </html>
      `,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Servidor rodando na porta ${process.env.PORT || 3000}`);
