# 🔍 Gerador de Leads - Maps & SEO

Ferramenta full-stack de arquivo único criada com **Bun** e **TypeScript** para prospectar clientes locais automaticamente. Ela varre empresas no Google Maps por nicho e cidade, retornando uma interface visual que separa estabelecimentos sem presença digital daqueles que precisam de otimização de SEO (via PageSpeed Insights).

## 🚀 Como rodar localmente

1. Insira a sua chave do Google Cloud (com a `Places API` e `PageSpeed Insights API` ativadas) na primeira linha do arquivo `http.ts`.
2. Instale o Bun na sua máquina (caso não tenha): 
   ```bash
   curl -fsSL [https://bun.sh/install](https://bun.sh/install) | bash
Inicie o servidor:

Bash
bun run http.ts
Acesse http://localhost:3000 no seu navegado
