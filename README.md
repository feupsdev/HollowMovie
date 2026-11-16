# 🎬 HollowMovie

Plataforma de descoberta de filmes e séries com dados da [TMDB](https://www.themoviedb.org). Explore tendências, encontre títulos, consulte informações detalhadas, assista a trailers, descubra onde assistir no Brasil e organize seus favoritos.

**Acesse:** https://hollowmovie.netlify.app

Desenvolvido com JavaScript puro, HTML5 e CSS3, utilizando módulos ES e uma arquitetura sem frameworks.

---

## ✨ Funcionalidades

- **Página inicial:** tendências diárias e semanais, recomendações, filmes e séries populares, lançamentos e banner rotativo.
- **Filmes e séries:** filtros combináveis por gênero, ano, nota, país, idioma e ordenação.
- **Busca inteligente:** pesquisa de filmes, séries e pessoas, sugestões automáticas e filtros.
- **Detalhes:** sinopse, avaliações, elenco, direção, duração, gêneros, trailers e recomendações.
- **Onde assistir:** informações de disponibilidade de streaming no Brasil.
- **Favoritos:** salve, remova, filtre e organize seus títulos preferidos.
- **Histórico:** acompanhe os títulos visitados.
- **Perfil:** estatísticas, preferências, personalização de tema e exportação de dados.
- **Interface responsiva:** experiência adaptada para computadores e dispositivos móveis.

## 🛠️ Tecnologias

| Tecnologia | Utilização |
|---|---|
| HTML5 | Estrutura da aplicação |
| CSS3 | Estilização, responsividade e temas |
| JavaScript ES Modules | Lógica e funcionalidades |
| TMDB API | Dados de filmes, séries e pessoas |
| Netlify Functions | Proxy seguro para a API |
| Node.js | Ambiente de desenvolvimento e testes |
| LocalStorage | Favoritos, histórico e preferências |

## 🔐 Segurança

A comunicação com a TMDB é realizada por uma Netlify Function, mantendo a chave da API no ambiente do servidor.

A aplicação também utiliza:
- Content Security Policy (CSP).
- Validação de parâmetros no proxy.
- Allowlist de endpoints permitidos.
- Proteção contra exposição da chave da API.
- Escape de conteúdo dinâmico para reduzir riscos de XSS.

## 🚀 Executar localmente

**Requisitos:** Node.js 18 ou superior.

1. Clone o repositório:

```bash
git clone https://github.com/feupsdev/HollowMovie.git
cd HollowMovie
```

2. Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

3. Adicione sua chave da TMDB no arquivo `.env`:

```env
TMDB_API_KEY=sua_chave_aqui
```

4. Inicie o servidor:

```bash
npm run dev
```

5. Acesse:

```text
http://localhost:8888
```

Não abra o `index.html` diretamente pelo navegador. A aplicação depende das rotas e da função de API.

## ☁️ Deploy na Netlify

O projeto utiliza Netlify Functions e não precisa de etapa de build.

1. Importe o repositório do GitHub na Netlify.
2. Configure o diretório de publicação como `.`.
3. Adicione a variável de ambiente `TMDB_API_KEY`.
4. Faça o deploy.

A configuração de publicação e funções está definida em `netlify.toml`.

## 🧪 Testes

Para executar os testes do proxy da TMDB:

```bash
npm test
```

## 📁 Estrutura do projeto

```text
HollowMovie/
├── assets/
│   ├── fonts/
│   └── img/
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── components.css
│   └── pages.css
├── js/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── utils/
│   ├── config.js
│   ├── main.js
│   └── router.js
├── netlify/
│   └── functions/
│       └── tmdb.mjs
├── scripts/
├── tests/
├── .env.example
├── index.html
├── netlify.toml
├── package.json
└── README.md
```

## ⚖️ Créditos e atribuições

Os dados de filmes, séries, imagens e informações relacionadas são fornecidos pela [The Movie Database (TMDB)](https://www.themoviedb.org).

A disponibilidade de streaming utiliza informações fornecidas pelo JustWatch por meio da integração com a TMDB.

Este produto utiliza a API da TMDB, mas não é endossado nem certificado por ela.

## 👨‍💻 Desenvolvido por

**feups.dev** — Desenvolvimento web e soluções digitais.

- **Website:** https://feupsdev.vercel.app
- **GitHub:** https://github.com/feupsdev
- **Instagram:** https://www.instagram.com/feupsdev/
- **X:** https://x.com/feupsdev/
- **LinkedIn:** https://www.linkedin.com/in/felipe-henrique-07990228a/
- **E-mail:** felipehenriquedsc@gmail.com

---

© 2026 feups.dev. Todos os direitos reservados.