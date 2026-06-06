// ClaudeHandler.gs - Complete version with phrase optimization
const ClaudeHandler = {
  // API Configuration
  API_CONFIG: {
    BASE_URL: 'https://api.anthropic.com/v1/messages',
    VERSION: '2023-06-01',
    MODEL: 'claude-3-sonnet-20240229',
    MAX_RETRIES: 3,
    TIMEOUT_MS: 30000,
    RATE_LIMIT_DELAY_MS: 5000
  },

  async processProduct(productData, selectedRow) {
    try {
      // Step 1: Get and analyze keyword file
      console.log("Starting to process product data");
      const keywordFileContent = await this.getFileContent(productData.keyword_file_url);
      console.log("Retrieved keyword file content");

      const availableKeywords = this.extractKeywords(keywordFileContent);
      console.log(`Extracted ${availableKeywords.length} keywords`);

      // Validate product data before proceeding
      if (!productData.brand_name || !productData.product_information) {
        throw new Error("Missing required product information");
      }

      console.log("Constructing initial prompt");
      // Step 2: Generate initial listing with keywords
      const prompt = this.constructPrompt(productData, availableKeywords);

      // Add delay before API call
      await Utilities.sleep(1000);

      console.log("Making initial API call");
      let response = await this.callClaudeAPI(prompt);
      console.log("Received initial API response");

      // Step 3: Optimize content through verification loops
      console.log("Starting content optimization");
      response = await this.optimizeContent(response, productData, availableKeywords);
      console.log("Content optimization complete");

      // Add the original keywords to the response for tracking
      response.listing.available_keywords = availableKeywords;

      return response;
    } catch (error) {
      console.error("Process Product Error:", error);
      // Enhance error message with more context
      const errorMessage = error.message.includes('API request failed') 
        ? `API Error: Please check your API key and try again. ${error.message}`
        : error.message;
      throw new Error(errorMessage);
    }
  },

  async getFileContent(fileUrl) {
    try {
      const fileId = this.extractFileId(fileUrl);
      if (!fileId) {
        throw new Error("Invalid file URL. Could not extract file ID.");
      }

      console.log("Attempting to access file with ID:", fileId);
      const file = DriveApp.getFileById(fileId);
      const content = file.getBlob().getDataAsString();
      console.log("CSV content retrieved. First line:", content.split('\n')[0]);
      return content;
    } catch (error) {
      throw new Error(`File access failed: ${error.message}`);
    }
  },

  extractFileId(url) {
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  },

  extractKeywords(fileContent) {
    try {
      // Split content into lines and remove header
      const lines = fileContent.split('\n').slice(1);
      
      // Extract keyword phrases from first column
      const keywords = lines
        .map(line => {
          const columns = line.split(',');
          return columns[0] ? columns[0].trim() : null;
        })
        .filter(keyword => {
          return keyword && 
                 keyword.length >= 3 && 
                 // Updated regex to allow multiple words and hyphens
                 /^[a-zA-Z0-9\s-]+$/.test(keyword) &&
                 // Validate keyword phrase length (3-50 chars)
                 keyword.length <= 50 &&
                 // Ensure it's a proper phrase (no double spaces, leading/trailing spaces)
                 keyword === keyword.replace(/\s+/g, ' ').trim();
        });

      console.log("Total valid keyword phrases found:", keywords.length);

      if (keywords.length < 20) {
        throw new Error(`Need at least 20 keyword phrases. Found ${keywords.length}. First few phrases: ${keywords.slice(0, 5).join(', ')}...`);
      }

      return keywords;
    } catch (error) {
      throw new Error(`Keyword extraction failed: ${error.message}`);
    }
  },

  async optimizeContent(result, productData, availableKeywords) {
    console.log("Starting content optimization...");
    let optimizedResult = result;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    
    while (attempts < MAX_ATTEMPTS) {
      try {
        // Validate current content
        const validationIssues = this.validateContent(optimizedResult, availableKeywords);
        
        if (validationIssues.length === 0) {
          console.log("Content validation passed!");
          break;
        }

        console.log("Validation issues found:", validationIssues);
        
        // Wait between optimization attempts
        await Utilities.sleep(this.API_CONFIG.RATE_LIMIT_DELAY_MS);

        // Create optimization prompt
        const optimizationPrompt = this.constructOptimizationPrompt(
          productData, 
          optimizedResult, 
          validationIssues,
          availableKeywords
        );

        // Get optimized content
        optimizedResult = await this.callClaudeAPI(optimizationPrompt);
        attempts++;
        
      } catch (error) {
        console.error("Optimization attempt failed:", error);
        attempts++;
        await Utilities.sleep(this.API_CONFIG.RATE_LIMIT_DELAY_MS);
      }
    }

    return optimizedResult;
  },

  validateContent(result, availableKeywords) {
    const issues = [];
    const listing = result.listing;

    // Title validation
    if (listing.title.length > 200) {
      issues.push(`Title exceeds 200 characters (${listing.title.length})`);
    }

    // Bullet points validation
    listing.bullet_points.forEach((bullet, index) => {
      if (bullet.length < 230 || bullet.length > 250) {
        issues.push(`Bullet point ${index + 1} length (${bullet.length}) outside 230-250 range`);
      }
    });

    // Description validation
    if (listing.description.length < 1800) {
      issues.push(`Description too short (${listing.description.length} chars, min 1800)`);
    }

    // Keyword phrase usage validation
    const usedPhrases = this.extractUsedKeywords(result);
    usedPhrases.forEach(phrase => {
      if (!availableKeywords.includes(phrase)) {
        issues.push(`Used keyword phrase "${phrase}" not found in provided keywords list`);
      }
    });

    // Check for logical keyword placement
    if (!this.validateKeywordLogic(result)) {
      issues.push("Keyword phrase placement doesn't make logical sense in context");
    }

    // Check for complete phrases (no partial matches)
    const allContent = listing.title + ' ' + listing.bullet_points.join(' ') + ' ' + listing.description;
    availableKeywords.forEach(phrase => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'i');
      if (allContent.includes(phrase) && !regex.test(allContent)) {
        issues.push(`Keyword phrase "${phrase}" is used partially or without proper word boundaries`);
      }
    });

    return issues;
  },

  extractUsedKeywords(result) {
    const keywords = new Set();
    const tracking = result.keyword_tracking;

    tracking.title_keywords.forEach(k => keywords.add(k));
    tracking.bullet_point_keywords.primary.forEach(k => keywords.add(k));
    tracking.bullet_point_keywords.secondary.forEach(k => keywords.add(k));
    tracking.description_keywords.primary.forEach(k => keywords.add(k));
    tracking.description_keywords.secondary.forEach(k => keywords.add(k));

    return Array.from(keywords);
  },

  validateKeywordLogic(result) {
    try {
      const listing = result.listing;
      
      // Check title logic
      if (!this.validateTitlePhrases(listing.title, result.keyword_tracking.title_keywords)) {
        return false;
      }

      // Check bullet points logic
      for (let i = 0; i < listing.bullet_points.length; i++) {
        if (!this.validateBulletPhrases(
          listing.bullet_points[i], 
          result.keyword_tracking.bullet_point_keywords.primary[i]
        )) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("Keyword logic validation error:", error);
      return false;
    }
  },

  validateTitlePhrases(title, keywords) {
    try {
      // Check if phrases appear in a natural order
      let lastIndex = -1;
      const titleLower = title.toLowerCase();
      
      for (const phrase of keywords) {
        const index = titleLower.indexOf(phrase.toLowerCase());
        if (index === -1) return false;
        
        // Check for word boundaries
        if (index > 0 && /[a-zA-Z0-9]/.test(titleLower[index - 1])) return false;
        const endIndex = index + phrase.length;
        if (endIndex < titleLower.length && /[a-zA-Z0-9]/.test(titleLower[endIndex])) return false;
        
        if (index < lastIndex) return false;
        lastIndex = index;
      }
      return true;
    } catch (error) {
      console.error("Title phrase validation error:", error);
      return false;
    }
  },

  validateBulletPhrases(bullet, primaryPhrase) {
    try {
      const bulletLower = bullet.toLowerCase();
      const phraseLower = primaryPhrase.toLowerCase();
      
      // Updated context indicators for phrases
      const contextIndicators = [
        'featuring', 'with', 'includes', 'offers', 'provides', 'using', 
        'made of', 'designed with', 'equipped with', 'comes with',
        'boasts', 'incorporates', 'utilizes', 'enhanced by'
      ];

      // Check if phrase appears after a context indicator
      const hasContextIndicator = contextIndicators.some(indicator => {
        const indicatorIndex = bulletLower.indexOf(indicator);
        const phraseIndex = bulletLower.indexOf(phraseLower);
        return indicatorIndex !== -1 && indicatorIndex < phraseIndex;
      });

      // Check for natural phrase integration
      const phraseWords = phraseLower.split(' ');
      const bulletWords = bulletLower.split(' ');
      const phraseIndex = bulletWords.findIndex(word => word === phraseWords[0]);
      
      if (phraseIndex === -1) return false;

      // Verify the complete phrase appears in sequence
      for (let i = 0; i < phraseWords.length; i++) {
        if (bulletWords[phraseIndex + i] !== phraseWords[i]) {
          return false;
        }
      }

      return hasContextIndicator;
    } catch (error) {
      console.error("Bullet phrase validation error:", error);
      return false;
    }
  },

  constructPrompt(productData, keywords) {
    return {
      role: 'user',
      content: `Create an Amazon product listing using these EXACT keyword distribution rules:

Brand: ${productData.brand_name}
Product Information: ${productData.product_information}
Available Keyword Phrases: ${JSON.stringify(keywords)}

STRICT Keyword Distribution Requirements:
1. Title (max 200 chars):
   - Start with brand name
   - Include 3-4 most relevant keyword phrases
   - Format: Brand Name - Primary Phrase - Secondary Phrases
   - Use complete phrases only, no partial matches
   - NO duplicate phrases in title

2. Bullet Points (230-250 chars each):
   - EXACTLY 5 bullet points
   - Each bullet point MUST contain ONE UNIQUE primary keyword phrase formatted as **keyword phrase**
   - Can include 1-2 additional secondary keyword phrases in each bullet
   - NO duplicate phrases across bullet points
   - Each bullet point must start with a benefit or feature header
   - Use natural transitions for phrase integration
   - Total: 5 primary + 5-10 secondary unique phrases

3. Description (min 1800 chars):
   - MUST include EXACTLY 5 unique primary keyword phrases formatted as **keyword phrase**
   - Include 5-7 additional secondary keyword phrases naturally
   - NO duplicate phrases within description
   - DO NOT repeat phrases from title or bullet points
   - Ensure natural flow and readability with phrases
   - Total: 5 primary + 5-7 secondary unique phrases

4. Search Terms:
   - Include ALL relevant keyword phrases
   - CAN repeat phrases from other sections
   - CAN include variations of used phrases
   - Max 250 bytes total
   - Replace spaces with hyphens in search terms

IMPORTANT:
- Use COMPLETE phrases exactly as provided
- Maintain natural language flow
- No partial phrase matches
- Include minimum 20 unique phrases in main content

Return ONLY the following JSON with NO additional text or explanations:
{
  "listing": {
    "title": "string",
    "bullet_points": ["string"],
    "description": "string",
    "html_description": "string",
    "search_terms": ["string"]
  },
  "keyword_tracking": {
    "title_keywords": ["string"],
    "bullet_point_keywords": {
      "primary": ["string"],
      "secondary": ["string"]
    },
    "description_keywords": {
      "primary": ["string"],
      "secondary": ["string"]
    },
    "search_terms": ["string"]
  }
}`
    };
  },

  constructOptimizationPrompt(productData, currentResult, issues, availableKeywords) {
    return {
      role: 'user',
      content: `Optimize this Amazon listing to fix the following issues:

Current Issues:
${issues.join('\n')}

Current Listing:
${JSON.stringify(currentResult.listing, null, 2)}

Brand: ${productData.brand_name}
Available Keyword Phrases: ${JSON.stringify(availableKeywords)}

Requirements:
1. Fix all listed issues while maintaining other aspects
2. Keep same structure and format
3. Ensure all keyword phrases are used exactly as provided
4. Maintain natural language flow
5. Follow all character limits strictly
6. Keep keyword distribution rules from original listing
7. Use complete phrases only - no partial matches

Return ONLY the optimized JSON with NO additional text.`
    };
  },

  async callClaudeAPI(prompt, retryCount = 0) {
    const CLAUDE_API_KEY = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    
    try {
      const response = await this.makeAPIRequest(CLAUDE_API_KEY, prompt);
      return this.parseAPIResponse(response);
    } catch (error) {
      if (retryCount < this.API_CONFIG.MAX_RETRIES) {
        await Utilities.sleep(Math.pow(2, retryCount) * this.API_CONFIG.RATE_LIMIT_DELAY_MS);
        return this.callClaudeAPI(prompt, retryCount + 1);
      }
      throw error;
    }
  },

  makeAPIRequest(apiKey, prompt) {
    try {
      // Format the request payload according to Claude API specs
      const payload = {
        model: this.API_CONFIG.MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt.content
        }]
      };

      // Setup request options
      const options = {
        method: 'post',
        headers: {
          'anthropic-version': this.API_CONFIG.VERSION,
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-beta': 'messages-2023-12-15'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      // Log request for debugging
      console.log("Making API request with payload:", JSON.stringify(payload, null, 2));

      // Make the request
      const response = UrlFetchApp.fetch(this.API_CONFIG.BASE_URL, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      // Log response for debugging
      console.log("API Response Code:", responseCode);
      console.log("API Response:", responseText);

      if (responseCode !== 200) {
        let errorMessage = `API request failed with code ${responseCode}`;
        try {
          const errorResponse = JSON.parse(responseText);
          if (errorResponse.error) {
            errorMessage += `: ${errorResponse.error.message || errorResponse.error}`;
          }
        } catch (e) {
          // If we can't parse the error response, just use the status code
          console.error("Failed to parse error response:", e);
        }
        throw new Error(errorMessage);
      }

      return response;
    } catch (error) {
      console.error("API Request Error:", error);
      throw new Error(`API request failed: ${error.message}`);
    }
  },

  parseAPIResponse(response) {
    try {
      const responseData = JSON.parse(response.getContentText());
      
      // Clean the text content before parsing
      let cleanedText = responseData.content[0].text
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
        .replace(/\n/g, '\\n')                 // Escape newlines
        .replace(/\r/g, '\\r')                 // Escape carriage returns
        .replace(/\t/g, '\\t')                 // Escape tabs
        .replace(/\\(?!["\\/bfnrtu])/g, '\\\\') // Escape backslashes
        .replace(/\u2028/g, '\\n')            // Replace line separator
        .replace(/\u2029/g, '\\n')            // Replace paragraph separator
        .replace(/â€™/g, "'")                 // Fix smart quotes
        .replace(/â€œ/g, '"')                 // Fix smart quotes
        .replace(/â€/g, '"');                 // Fix smart quotes

      // Extract JSON content
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      cleanedText = jsonMatch[0];

      // Log the cleaned text for debugging
      console.log("Cleaned response text:", cleanedText);

      try {
        const result = JSON.parse(cleanedText);

        // Convert HTML description
        result.listing.html_description = result.listing.description
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>');

        // Validate result structure
        if (!this.validateResponseStructure(result)) {
          throw new Error('Invalid response structure');
        }

        return result;
      } catch (jsonError) {
        console.error("JSON Parse Error:", jsonError);
        console.error("Problematic text:", cleanedText);
        throw new Error(`Failed to parse cleaned response: ${jsonError.message}`);
      }
    } catch (error) {
      console.error("API Response Error:", error);
      throw new Error(`Failed to parse API response: ${error.message}`);
    }
  },

  validateResponseStructure(result) {
    try {
      // Check if result has required top-level properties
      if (!result.listing || !result.keyword_tracking) {
        return false;
      }

      // Check listing structure
      const listing = result.listing;
      if (!listing.title || !Array.isArray(listing.bullet_points) || 
          !listing.description || !listing.search_terms) {
        return false;
      }

      // Check bullet points
      if (listing.bullet_points.length !== 5) {
        return false;
      }

      // Check keyword_tracking structure
      const tracking = result.keyword_tracking;
      if (!Array.isArray(tracking.title_keywords) || 
          !tracking.bullet_point_keywords || 
          !tracking.description_keywords || 
          !Array.isArray(tracking.search_terms)) {
        return false;
      }

      // Check bullet_point_keywords structure
      if (!Array.isArray(tracking.bullet_point_keywords.primary) ||
          !Array.isArray(tracking.bullet_point_keywords.secondary) ||
          tracking.bullet_point_keywords.primary.length !== 5) {
        return false;
      }

      // Check description_keywords structure
      if (!Array.isArray(tracking.description_keywords.primary) ||
          !Array.isArray(tracking.description_keywords.secondary) ||
          tracking.description_keywords.primary.length !== 5) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Response structure validation error:", error);
      return false;
    }
  }
};
