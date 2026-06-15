const GOOGLE_API_KEY = "AIzaSyA-J4VenGoCiQeI3qX1NECd7hebwM7X4As";

interface Place {
  name: string;
  place_id: string;
  formatted_address: string;
}
interface PlaceDetails extends Place {
  website?: string;
  phone_number?: string;
}
interface LeadSemSite {
  nome: string;
  endereco: string;
  telefone: string;
}
interface LeadComSite {
  nome: string;
  site: string;
  telefone: string;
  notaSeo: number | null;
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

    if (data.error) {
      console.error(
        `\n❌ [ERRO API PageSpeed - URL: ${url}]: ${data.error.message}\n`
      );
      return null;
    }

    return data.lighthouseResult?.categories?.seo?.score * 100 || null;
  } catch (error) {
    console.error(`\n❌ [ERRO INTERNO PageSpeed - URL: ${url}]: ${error}\n`);
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
        telefone: details.phone_number || "Não informado",
      });
    } else {
      const seoScore = await runSeoTest(details.website);
      leadsComSiteParaOtimizar.push({
        nome: details.name,
        site: details.website,
        telefone: details.phone_number || "Não informado",
        notaSeo: seoScore,
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

        console.log(`[API] Iniciando busca para: ${searchQuery}`);
        const relatorio = await generateLeadsReport(searchQuery);

        return Response.json(relatorio);
      } catch (error) {
        console.error("Erro interno do servidor na rota POST:", error);
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
          <div class="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
            <h1 class="text-2xl font-bold mb-6 text-gray-800">Prospecção de Leads</h1>
            
            <div class="flex flex-col md:flex-row gap-4 mb-8">
              <input type="text" id="keyword" placeholder="O que buscar? (Ex: Clínica Veterinária)" 
                class="flex-1 border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              
              <input type="text" id="cidade" placeholder="Onde? (Ex: Canoas)" value="Porto Alegre"
                class="flex-1 border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              
              <button onclick="buscar()" id="btn-buscar"
                class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-semibold transition whitespace-nowrap">
                Buscar Leads
              </button>
            </div>

            <div id="loading" class="hidden text-blue-600 font-semibold mb-4 animate-pulse">
              Varrendo o Google Maps e testando SEO. Isso pode levar alguns minutos...
            </div>

            <div id="resultados" class="hidden">
              <h2 class="text-xl font-bold text-red-600 mb-2">🚨 Sem Site (Prioridade)</h2>
              <pre id="sem-site" class="bg-gray-50 p-4 rounded text-sm overflow-x-auto border border-gray-200 mb-6"></pre>

              <h2 class="text-xl font-bold text-green-600 mb-2">📈 Com Site (Oportunidade SEO)</h2>
              <pre id="com-site" class="bg-gray-50 p-4 rounded text-sm overflow-x-auto border border-gray-200"></pre>
            </div>
          </div>

          <script>
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
                
                document.getElementById('sem-site').textContent = JSON.stringify(data.semSite, null, 2);
                document.getElementById('com-site').textContent = JSON.stringify(data.comSite, null, 2);
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
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Servidor rodando na porta ${process.env.PORT || 3000}`);
