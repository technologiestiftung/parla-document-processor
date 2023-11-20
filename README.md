![](https://img.shields.io/badge/Built%20with%20%E2%9D%A4%EF%B8%8F-at%20Technologiestiftung%20Berlin-blue)

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

# ki-anfragen-document-processor

This repository contains scripts for pre-processing PDF files for later use in the KI-Anfragen project. It offers a generic way of importing / registering and processing PDF documents. For the use case of "KI-Anfragen", the publicly accessible PDF documents of "Schriftliche Anfragen" and "Hauptausschussprotokolle" are used.

## Prerequisites

- Running and accessible Supabase database with the schema defined in https://github.com/technologiestiftung/ki-anfragen-api
- OpenAI API Key

## Features

- Register relevant documents from various data sources, see [./src/importers](./src/importers). Registering documents means storing their download URL and possible metadata in the database.
- Process registered documents by

  1. Downloading the PDF
  2. Extracting text content from the PDF (either directly or via **OCR**)
  3. Generating a summary of the PDF content via OpenAI
  4. Generating a list of tags describing the PDF content via OpenAI
  5. Generating embedding vectors of each PDF page via OpenAI

## Limitations

- Only PDF documents are supported
- The download URL of the documents must be publicly accessible
- Documents with > 100 pages will not be processed (set via environment variable)
- Documents with a content length of > 15000 tokens will not be summarized (set via environment variable)

## Environment variables

See [.env.sample](.env.sample)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_DB_CONNECTION=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_EMBEDDING_MODEL=
PROCESSING_DIR=. // Directory for storing temporary processing files
ALLOW_DELETION=false // Documents with missing embeddings will not be deleted from the database
MAX_PAGES_LIMIT=64 // Documents with more pages than this will not be processed
MAX_DOCUMENTS_TO_PROCESS=1000 // A maximum number of documents to process
```

## Run locally

**⚠️ Warning: Running those scripts on many PDF documents will result in significant costs. ⚠️**

- Setup `.env` file based on `.env.sample`
- Run `npm ci` to install dependencies
- Run `npx tsx ./src/run_import.ts` to register the documents
- Run `npx tsx ./src/run_process.ts` to process all unprocessed documents

## Related repositories

- API and database definition: https://github.com/technologiestiftung/ki-anfragen-api
- KI-Anfragen frontend: https://github.com/technologiestiftung/ki-anfragen-frontend

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://fabianmoronzirfas.me/"><img src="https://avatars.githubusercontent.com/u/315106?v=4?s=100" width="100px;" alt="Fabian Morón Zirfas"/><br /><sub><b>Fabian Morón Zirfas</b></sub></a><br /><a href="https://github.com/technologiestiftung/ki-anfragen-document-processor/commits?author=ff6347" title="Code">💻</a> <a href="#ideas-ff6347" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Jaszkowic"><img src="https://avatars.githubusercontent.com/u/10830180?v=4?s=100" width="100px;" alt="Jonas Jaszkowic"/><br /><sub><b>Jonas Jaszkowic</b></sub></a><br /><a href="https://github.com/technologiestiftung/ki-anfragen-document-processor/commits?author=Jaszkowic" title="Code">💻</a> <a href="#ideas-Jaszkowic" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-Jaszkowic" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## Credits

<table>
  <tr>
    <td>
      Made by <a href="https://citylab-berlin.org/de/start/">
        <br />
        <br />
        <img width="200" src="https://logos.citylab-berlin.org/logo-citylab-berlin.svg" />
      </a>
    </td>
    <td>
      A project by <a href="https://www.technologiestiftung-berlin.de/">
        <br />
        <br />
        <img width="150" src="https://logos.citylab-berlin.org/logo-technologiestiftung-berlin-de.svg" />
      </a>
    </td>
    <td>
      Supported by <a href="https://www.berlin.de/rbmskzl/">
        <br />
        <br />
        <img width="80" src="https://logos.citylab-berlin.org/logo-berlin-senatskanzelei-de.svg" />
      </a>
    </td>
  </tr>
</table>

## Related Projects

- https://github.com/technologiestiftung/ki-anfragen-frontend
- https://github.com/technologiestiftung/ki-anfragen-api
