// SheetHandler.gs - Complete version with enhanced formatting
const SheetHandler = {
  setupSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = {
      input: this.getOrCreateSheet(ss, 'Input'),
      output: this.getOrCreateSheet(ss, 'Output'),
      keywords: this.getOrCreateSheet(ss, 'Keywords')
    };
    
    this.setupHeaders(sheets);
    this.formatSheets(sheets);
    return sheets;
  },

  getOrCreateSheet(ss, sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    return sheet;
  },

  setupHeaders(sheets) {
    // Input sheet headers
    const inputHeaders = [
      'Brand Name',
      'Keyword File URL',
      'Product Information',
      'Status'
    ];
    this.setSheetHeaders(sheets.input, inputHeaders);

    // Output sheet headers
    const outputHeaders = [
      'Title',
      'Bullet Points',
      'Description',
      'HTML Description',
      'Search Terms',
      'Keywords Used',
      'Combined Content',
      'Combined HTML'
    ];
    this.setSheetHeaders(sheets.output, outputHeaders);

    // Keywords sheet headers
    const keywordHeaders = [
      'Keyword',
      'Used In',
      'Usage Count',
      'Primary/Secondary',
      'Status'
    ];
    this.setSheetHeaders(sheets.keywords, keywordHeaders);
  },

  setSheetHeaders(sheet, headers) {
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange
      .setValues([headers])
      .setBackground('#f3f3f3')
      .setFontWeight('bold')
      .setWrap(true);
    
    sheet.setFrozenRows(1);
  },

  formatSheets(sheets) {
    // Format Input sheet
    sheets.input.setColumnWidths(1, 4, 300);
    
    // Format Output sheet columns
    const outputWidths = [250, 400, 600, 600, 200, 300, 600, 600];
    outputWidths.forEach((width, index) => {
      sheets.output.setColumnWidth(index + 1, width);
    });
    
    // Format Keywords sheet
    const keywordWidths = [200, 300, 100, 150, 100];
    keywordWidths.forEach((width, index) => {
      sheets.keywords.setColumnWidth(index + 1, width);
    });
  },

  getProductData(sheet, row) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowData = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    
    const product = {};
    headers.forEach((header, index) => {
      product[this.normalizeHeaderKey(header)] = rowData[index];
    });
    
    return this.validateProductData(product);
  },

  normalizeHeaderKey(header) {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '_');
  },

  validateProductData(product) {
    const requiredFields = ['brand_name', 'keyword_file_url', 'product_information'];
    const missingFields = requiredFields.filter(field => !product[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate brand name starts with capital letter
    if (!/^[A-Z]/.test(product.brand_name)) {
      throw new Error('Brand name must start with a capital letter');
    }

    // Validate URL format
    if (!/^https:\/\/(drive|docs)\.google\.com/.test(product.keyword_file_url)) {
      throw new Error('Invalid keyword file URL. Must be a Google Drive or Sheets URL');
    }

    return product;
  },

  writeResults(sheets, results) {
    try {
      console.log("Results received:", results);

      if (!results || !results.listing || !results.keywords_used) {
        throw new Error('Invalid results structure received');
      }

      const { row, listing, keywords_used } = results;
      
      // Validate required properties
      if (!listing.title || !listing.bullet_points || !listing.description || 
          !listing.html_description || !listing.search_terms) {
        throw new Error('Missing required listing properties');
      }

      // Format HTML description
      const htmlDescription = this.convertToSingleLineHtml(listing.html_description);

      // Create combined content
      const combinedContent = this.createCombinedContent(listing, keywords_used);
      const combinedHtml = this.createCombinedHtml(listing, keywords_used);

      // Write to Output sheet
      const outputValues = [
        [
          listing.title || '',
          this.formatBulletPoints(listing.bullet_points || []),
          listing.description || '',
          htmlDescription,
          (listing.search_terms || []).join(', '),
          this.formatKeywordUsage(keywords_used || {}),
          combinedContent,
          combinedHtml
        ]
      ];
      
      const outputRange = sheets.output.getRange(row, 1, 1, 8);
      outputRange
        .setValues(outputValues)
        .setWrap(true)
        .setVerticalAlignment('top');

      // Update Keywords sheet if data available
      if (listing.available_keywords && keywords_used) {
        this.writeKeywords(sheets, listing.available_keywords, keywords_used);
      }
    } catch (error) {
      console.error("Write results error:", error);
      this.writeError(sheets.output, row, error.message);
      throw error;
    }
  },

  createCombinedContent(listing, keywords_used) {
    const sections = [
      `Product Name: ${listing.title}`,
      `\nTitle: ${listing.title}`,
      `\nKeywords Used: ${this.formatKeywordUsage(keywords_used)}`,
      `\nBullet Points:\n${this.formatBulletPoints(listing.bullet_points)}`,
      `\nDescription:\n${listing.description}`,
      `\nSearch Terms: ${listing.search_terms.join(', ')}`
    ];

    return sections.join('\n');
  },

  createCombinedHtml(listing, keywords_used) {
    const htmlBullets = listing.bullet_points.map((bullet, index) => 
      `${index + 1}. ${bullet.replace(/\n/g, '<br>')}`
    ).join('<br><br>');

    const sections = [
      `<b>Product Name:</b> ${listing.title}`,
      `<b>Title:</b> ${listing.title}`,
      `<b>Keywords Used:</b><br>${this.formatKeywordUsageHtml(keywords_used)}`,
      `<b>Bullet Points:</b><br>${htmlBullets}`,
      `<b>Description:</b><br>${this.convertToSingleLineHtml(listing.html_description)}`,
      `<b>Search Terms:</b> ${listing.search_terms.join(', ')}`
    ];

    return sections.join('<br><br>');
  },

  convertToSingleLineHtml(description) {
    return description
      .replace(/\n/g, '<br>') // Replace newlines with <br>
      .replace(/\r/g, '') // Remove carriage returns
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/(<br\s*\/?>){3,}/gi, '<br><br>') // Replace multiple breaks with double break
      .trim(); // Remove leading/trailing whitespace
  },

  formatKeywordUsageHtml(keywordUsage) {
    if (!keywordUsage || typeof keywordUsage !== 'object') {
      return 'No keyword usage data available';
    }

    return Object.entries(keywordUsage)
      .filter(([_, value]) => value)
      .map(([section, keywords]) => {
        const sectionName = section.replace(/_/g, ' ').toLowerCase()
          .replace(/\b\w/g, l => l.toUpperCase());
        
        let keywordList;
        if (Array.isArray(keywords)) {
          keywordList = keywords.filter(k => k).join(', ');
        } else if (typeof keywords === 'object' && keywords !== null) {
          keywordList = Object.entries(keywords)
            .filter(([_, kws]) => kws)
            .map(([type, kws]) => {
              if (Array.isArray(kws)) {
                return `${type}: ${kws.filter(k => k).join(', ')}`;
              }
              return `${type}: ${kws}`;
            })
            .join('<br>');
        } else {
          keywordList = String(keywords || '');
        }
        
        return `<b>${sectionName}:</b><br>${keywordList}`;
      })
      .join('<br><br>');
  },

  formatBulletPoints(bullets) {
    if (!Array.isArray(bullets)) return '';
    return bullets
      .filter(bullet => bullet) // Remove null/undefined entries
      .map((bullet, index) => `${index + 1}. ${bullet}`)
      .join('\n\n');
  },

  formatKeywordUsage(keywordUsage) {
    if (!keywordUsage || typeof keywordUsage !== 'object') {
      return 'No keyword usage data available';
    }

    return Object.entries(keywordUsage)
      .filter(([_, value]) => value)
      .map(([section, keywords]) => {
        const sectionName = section.replace(/_/g, ' ').toLowerCase()
          .replace(/\b\w/g, l => l.toUpperCase());
        
        let keywordList;
        if (Array.isArray(keywords)) {
          keywordList = keywords.filter(k => k).join(', ');
        } else if (typeof keywords === 'object' && keywords !== null) {
          keywordList = Object.entries(keywords)
            .filter(([_, kws]) => kws)
            .map(([type, kws]) => {
              if (Array.isArray(kws)) {
                return `${type}: ${kws.filter(k => k).join(', ')}`;
              }
              return `${type}: ${kws}`;
            })
            .join('\n');
        } else {
          keywordList = String(keywords || '');
        }
        
        return `${sectionName}:\n${keywordList}`;
      })
      .join('\n\n');
  },

  writeKeywords(sheets, keywords, keywordTracking) {
    if (!keywords || !keywordTracking || !Array.isArray(keywords)) {
      console.log("Invalid keyword data received");
      return;
    }

    const keywordSheet = sheets.keywords;
    
    // Clear existing content except headers
    const lastRow = Math.max(keywordSheet.getLastRow(), 1);
    if (lastRow > 1) {
      keywordSheet.getRange(2, 1, lastRow - 1, 5).clear();
    }

    // Prepare keyword usage data
    const keywordData = this.prepareKeywordData(keywords, keywordTracking);

    // Write to sheet if we have data
    if (keywordData && keywordData.length > 0) {
      const range = keywordSheet.getRange(2, 1, keywordData.length, 5);
      range.setValues(keywordData);
      
      // Format status column
      const statusRange = keywordSheet.getRange(2, 5, keywordData.length, 1);
      this.formatStatusColumn(statusRange);
    }
  },

  prepareKeywordData(keywords, keywordTracking) {
    try {
      const keywordUsage = new Map();

      // Initialize all keywords
      keywords.forEach(keyword => {
        if (keyword) {
          keywordUsage.set(keyword, {
            usedIn: [],
            count: 0,
            type: 'Unused',
            status: 'Not Used'
          });
        }
      });

      // Track title keywords
      if (keywordTracking.title_keywords && Array.isArray(keywordTracking.title_keywords)) {
        keywordTracking.title_keywords.forEach(keyword => {
          if (keyword) {
            const usage = keywordUsage.get(keyword) || this.createNewUsage();
            usage.usedIn.push('Title');
            usage.count++;
            usage.type = 'Secondary';
            keywordUsage.set(keyword, usage);
          }
        });
      }

      // Track bullet point keywords
      if (keywordTracking.bullet_point_keywords) {
        const bpk = keywordTracking.bullet_point_keywords;
        
        if (bpk.primary && Array.isArray(bpk.primary)) {
          bpk.primary.forEach(keyword => {
            if (keyword) {
              const usage = keywordUsage.get(keyword) || this.createNewUsage();
              usage.usedIn.push('Bullet Points');
              usage.count++;
              usage.type = 'Primary';
              keywordUsage.set(keyword, usage);
            }
          });
        }

        if (bpk.secondary && Array.isArray(bpk.secondary)) {
          bpk.secondary.forEach(keyword => {
            if (keyword) {
              const usage = keywordUsage.get(keyword) || this.createNewUsage();
              usage.usedIn.push('Bullet Points');
              usage.count++;
              usage.type = 'Secondary';
              keywordUsage.set(keyword, usage);
            }
          });
        }
      }

      // Track description keywords
      if (keywordTracking.description_keywords) {
        const dk = keywordTracking.description_keywords;
        
        if (dk.primary && Array.isArray(dk.primary)) {
          dk.primary.forEach(keyword => {
            if (keyword) {
              const usage = keywordUsage.get(keyword) || this.createNewUsage();
              usage.usedIn.push('Description');
              usage.count++;
              usage.type = 'Primary';
              keywordUsage.set(keyword, usage);
            }
          });
        }

        if (dk.secondary && Array.isArray(dk.secondary)) {
          dk.secondary.forEach(keyword => {
            if (keyword) {
              const usage = keywordUsage.get(keyword) || this.createNewUsage();
              usage.usedIn.push('Description');
              usage.count++;
              usage.type = 'Secondary';
              keywordUsage.set(keyword, usage);
            }
          });
        }
      }

      // Track search terms
      if (keywordTracking.search_terms && Array.isArray(keywordTracking.search_terms)) {
        keywordTracking.search_terms.forEach(keyword => {
          if (keyword) {
            const usage = keywordUsage.get(keyword) || this.createNewUsage();
            usage.usedIn.push('Search Terms');
            usage.count++;
            keywordUsage.set(keyword, usage);
          }
        });
      }

      // Convert to array format for sheet
      return Array.from(keywordUsage.entries())
        .filter(([keyword]) => keyword)
        .map(([keyword, usage]) => [
          keyword,
          usage.usedIn.join(', '),
          usage.count,
          usage.type,
          this.determineStatus(usage)
        ]);
    } catch (error) {
      console.error("Error preparing keyword data:", error);
      return [];
    }
  },

  createNewUsage() {
    return {
      usedIn: [],
      count: 0,
      type: 'Unknown',
      status: 'Not Used'
    };
  },

  determineStatus(usage) {
    if (usage.count === 0) return 'Not Used';
    if (usage.count === 1) return 'Used Once';
    return 'Multiple Uses';
  },

  formatStatusColumn(range) {
    const numRows = range.getNumRows();
    const colors = [];

    for (let i = 0; i < numRows; i++) {
      const status = range.getCell(i + 1, 1).getValue();
      let color;
      switch (status) {
        case 'Not Used':
          color = '#ffe0e0'; // Light red
          break;
        case 'Used Once':
          color = '#e0ffe0'; // Light green
          break;
        case 'Multiple Uses':
          color = '#fff0e0'; // Light orange
          break;
        default:
          color = '#ffffff'; // White
      }
      colors.push([color]);
    }

    range.setBackgrounds(colors);
  },

  writeError(sheet, row, error) {
    // Write error message to each cell individually
    const errorMessage = 'ERROR: ' + error;
    const range = sheet.getRange(row, 1, 1, 8); // Updated to match total columns
    
    range
      .setValues([Array(8).fill(errorMessage)]) // Updated to match total columns
      .setBackground('#ffe0e0')
      .setFontColor('#cc0000')
      .setWrap(true);
  },

  updateStatus(sheet, row, status) {
    const statusColumn = sheet.getLastColumn();
    const cell = sheet.getRange(row, statusColumn);
    
    const statusColors = {
      'Error': '#ffe0e0',
      'Processing': '#fff0e0',
      'Complete': '#e0ffe0'
    };
    
    cell
      .setValue(status)
      .setBackground(statusColors[status] || '#ffffff');
  }
};
