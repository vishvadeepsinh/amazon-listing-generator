# Amazon Listing Generator
> Built while working at an e-commerce agency to automate Amazon product listing creation for sellers. Reduced manual content creation time significantly.
An AI-powered Google Sheets tool that auto-generates optimized Amazon product listings using the Claude API.

## Features
- Generates title, bullet points, description, and search terms from keyword files
- Multi-step optimization loop with automatic self-correction
- Keyword validation with word boundary checks
- Retry logic with exponential backoff
- Color-coded status tracking across Input, Output, and Keywords sheets

## Tech Stack
Google Apps Script, Claude API (Anthropic), Google Sheets, Google Drive API

## How It Works
1. Enter brand name, keyword file URL, and product information in the Input sheet
2. Run "Generate Optimized Listing" from the Amazon Listing menu
3. The tool fetches keywords, calls Claude API, validates output, and self-corrects up to 3 times
4. Results are written to the Output sheet with full keyword usage tracking
