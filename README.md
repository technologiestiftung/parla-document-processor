# ki-anfragen-document-processor

This repository contains scripts for pre-processing PDF files for later use in the KI-Anfragen project. It offers the generic way of importing / registering and processing PDF documents. For the use case of "KI-Anfragen", the publicly accessible PDF documents of "Schriftliche Anfragen" and "Hauptausschussprotokolle" are used.

## Prerequisites

- Running and accessible Supabase database with the schema defined in https://github.com/technologiestiftung/ki-anfragen-api
- OpenAI API Key

## Features

- Register relevant documents from various data sources, see [./src/importers](./src/importers). Registering documents means storing their download URL and possible metadata.
- Process registered documents by

  1. Downloading the PDF
  2. Extracting text content from the PDF (either directly or via **OCR**)
  3. Generating a summary of the PDF content via OpenAI
  4. Generating a list of tags describing the PDF content via OpenAI
  5. Generating embedding vectors of each PDF page via OpenAI

## Limitations

- Only PDF documents are supported
- The download URL of the documents must be publicly accessible
- Documents with > 100 pages will not be processed
- Documents with a content length of > 15000 tokens will not be summarized

## Run locally

**⚠️ Warning: Running those scripts on many PDF documents will result in significant costs. ⚠️**

- Setup `.env` file based on `.env.sample`
- Run `npm ci` to install dependencies
- Run `npx tsx ./src/run_import.ts` to register the documents
- Run `npx tsx ./src/run_process.ts` to process all unprocessed documents

## Related repositories

- API and database definition: https://github.com/technologiestiftung/ki-anfragen-api
- KI-Anfragen frontend: https://github.com/technologiestiftung/ki-anfragen-frontend
