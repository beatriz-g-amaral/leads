const GOOGLE_API_KEY = "AIzaSyA-J4VenGoCiQeI3qX1NECd7hebwM7X4As";

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

async function searchPlaces(query: string): Promise<Place[]> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&key=${GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(
      `\n❌ [ERRO API Google Places - Busca]: Status ${data.status}`
    );
    if (data.error_message) console.error(`Motivo: ${data.error_message}\n`);
  }

  return data.results || [];
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,website,formatted_address,formatted_phone_number&key=${GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK") {
    console.error(
      `\n❌ [ERRO API Google Places - Detalhes do ID ${placeId}]: Status ${data.status}`
    );
    if (data.error_message) console.error(`Motivo: ${data.error_message}\n`);
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
          <div class="max-w-5xl mx-auto bg-white p-8 rounded-lg shadow-md">
            <h1 class="text-3xl font-bold mb-6 text-gray-800">Prospecção de Leads</h1>
            
            <div class="flex flex-col md:flex-row gap-4 mb-8">
              <input type="text" id="keyword" placeholder="O que buscar? (Ex: Clínica Veterinária)" 
                class="flex-1 border border-gray-300 rounded px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              
              <input type="text" id="cidade" placeholder="Onde? (Ex: Canoas)" value="Porto Alegre"
                class="flex-1 border border-gray-300 rounded px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              
              <button onclick="buscar()" id="btn-buscar"
                class="bg-blue-600 text-white px-8 py-3 rounded text-lg hover:bg-blue-700 font-semibold transition whitespace-nowrap">
                Buscar Leads
              </button>
            </div>

            <div id="loading" class="hidden flex items-center gap-3 text-blue-600 font-semibold mb-4 animate-pulse">
              <svg class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Varrendo o Google Maps e testando SEO...
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
            function createCard(lead, tipo) {
              const mapsUrl = \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(lead.nome)}&query_place_id=\${lead.placeId}\`;
              
              let extraInfo = '';
              if (tipo === 'semsite') {
                extraInfo = \`<p class="text-sm text-gray-600 mt-1">📍 \${lead.endereco}</p>\`;
              } else {
                const seoColor = lead.notaSeo < 50 ? 'text-red-600' : lead.notaSeo < 80 ? 'text-yellow-600' : 'text-green-600';
                const seoText = lead.notaSeo ? \`<span class="font-bold \${seoColor}">\${lead.notaSeo}/100</span>\` : '<span class="text-gray-400">N/A</span>';
                
                extraInfo = \`
                  <p class="text-sm text-blue-600 mt-1 truncate"><a href="\${lead.site}" target="_blank" class="hover:underline">🌐 \${lead.site}</a></p>
                  <p class="text-sm text-gray-600 mt-1">🎯 Desempenho SEO: \${seoText}</p>
                \`;
              }

              return \`
                <div class="bg-gray-50 border border-gray-200 p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow relative group">
                  <h3 class="font-bold text-lg text-gray-800 pr-24">\${lead.nome}</h3>
                  <p class="text-md text-gray-700 mt-2 font-medium">📞 \${lead.telefone}</p>
                  \${extraInfo}
                  
                  <a href="\${mapsUrl}" target="_blank" 
                     class="absolute top-5 right-5 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-blue-200 transition">
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
              document.getElementById('btn-buscar').disabled = true;

              try {
                const res = await fetch('/api/buscar-leads', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ keyword, cidade })
                });
                
                const data = await res.json();
                
                document.getElementById('count-sem-site').textContent = data.semSite.length;
                document.getElementById('count-com-site').textContent = data.comSite.length;

                const containerSemSite = document.getElementById('lista-sem-site');
                containerSemSite.innerHTML = data.semSite.length > 0 
                  ? data.semSite.map(lead => createCard(lead, 'semsite')).join('')
                  : '<p class="text-gray-500 italic">Nenhuma empresa sem site encontrada.</p>';

                const containerComSite = document.getElementById('lista-com-site');
                containerComSite.innerHTML = data.comSite.length > 0
                  ? data.comSite.map(lead => createCard(lead, 'comsite')).join('')
                  : '<p class="text-gray-500 italic">Nenhuma empresa com site encontrada.</p>';

                document.getElementById('resultados').classList.remove('hidden');
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
