const Company = require('../models/Company');

/**
 * Company Discovery and ATS Signature Detection Service
 */
class CompanyDiscoveryService {
  /**
   * Crawl a home domain web page looking for footer or navigation career links.
   * @param {string} domainUrl - e.g. "kinsta.com"
   * @returns {Promise<string>} The resolved career page URL.
   */
  async crawlDomain(domainUrl) {
    try {
      let formattedUrl = domainUrl;
      if (!/^https?:\/\//i.test(domainUrl)) {
        formattedUrl = `https://${domainUrl}`;
      }

      console.log(`Crawling domain: ${formattedUrl}`);
      const res = await fetch(formattedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
      });
      if (!res.ok) return formattedUrl;

      const html = await res.text();
      
      // Regular expression to parse anchor hrefs from raw HTML
      const hrefRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]+)"/gi;
      let match;
      const candidates = [];

      while ((match = hrefRegex.exec(html)) !== null) {
        const link = match[1];
        let score = 0;
        if (/careers?/i.test(link)) score += 10;
        if (/jobs/i.test(link)) score += 8;
        if (/join/i.test(link)) score += 5;
        if (/work-with-us/i.test(link)) score += 7;
        if (/hiring/i.test(link)) score += 4;
        if (/recruitment/i.test(link)) score += 6;

        if (score > 0) {
          candidates.push({ link, score });
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const bestLink = candidates[0].link;
        try {
          return new URL(bestLink, formattedUrl).href;
        } catch (_) {
          return formattedUrl;
        }
      }

      return formattedUrl;
    } catch (e) {
      console.error(`Crawl error for domain ${domainUrl}:`, e);
      return domainUrl;
    }
  }

  /**
   * Scrapes the career page headers, URLs, and HTML signatures to match 10 ATS systems.
   * @param {string} careerUrl
   * @returns {Promise<Object>} { provider, boardUrl }
   */
  async detectATS(careerUrl) {
    try {
      console.log(`Detecting ATS for career URL: ${careerUrl}`);
      const res = await fetch(careerUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
      });
      
      const finalUrl = res.url || careerUrl;
      const html = res.ok ? await res.text() : "";

      // 1. Signature check on redirected Host URL
      const urlLower = finalUrl.toLowerCase();
      
      if (urlLower.includes('boards.greenhouse.io')) {
        return { provider: 'greenhouse', boardUrl: finalUrl };
      }
      if (urlLower.includes('jobs.lever.co')) {
        return { provider: 'lever', boardUrl: finalUrl };
      }
      if (urlLower.includes('jobs.ashbyhq.com')) {
        return { provider: 'ashby', boardUrl: finalUrl };
      }
      if (urlLower.includes('myworkdayjobs.com')) {
        return { provider: 'workday', boardUrl: finalUrl };
      }
      if (urlLower.includes('teamtailor.com')) {
        return { provider: 'teamtailor', boardUrl: finalUrl };
      }
      if (urlLower.includes('smartrecruiters.com')) {
        return { provider: 'smartrecruiters', boardUrl: finalUrl };
      }
      if (urlLower.includes('jobvite.com')) {
        return { provider: 'jobvite', boardUrl: finalUrl };
      }
      if (urlLower.includes('bamboohr.com') || urlLower.includes('bamboohr.co.uk')) {
        return { provider: 'bamboohr', boardUrl: finalUrl };
      }
      if (urlLower.includes('recruitee.com')) {
        return { provider: 'recruitee', boardUrl: finalUrl };
      }
      if (urlLower.includes('icims.com') || urlLower.includes('jobs-icims.com')) {
        return { provider: 'icims', boardUrl: finalUrl };
      }

      // 2. Signature check on HTML DOM content
      const htmlLower = html.toLowerCase();
      
      if (htmlLower.includes('boards.greenhouse.io') || htmlLower.includes('grnhse') || htmlLower.includes('boards-api.greenhouse.io')) {
        const ghMatch = /href="https?:\/\/boards\.greenhouse\.io\/([^/"]+)/i.exec(html);
        const boardUrl = ghMatch ? ghMatch[0] : careerUrl;
        return { provider: 'greenhouse', boardUrl };
      }
      
      if (htmlLower.includes('jobs.lever.co') || htmlLower.includes('api.lever.co')) {
        const leverMatch = /href="https?:\/\/jobs\.lever\.co\/([^/"]+)/i.exec(html);
        const boardUrl = leverMatch ? leverMatch[0] : careerUrl;
        return { provider: 'lever', boardUrl };
      }

      if (htmlLower.includes('jobs.ashbyhq.com') || htmlLower.includes('ashbyhq.com/embed')) {
        const ashbyMatch = /https?:\/\/jobs\.ashbyhq\.com\/([^/"]+)/i.exec(html);
        const boardUrl = ashbyMatch ? ashbyMatch[0] : careerUrl;
        return { provider: 'ashby', boardUrl };
      }

      if (htmlLower.includes('myworkdayjobs.com') || htmlLower.includes('workday')) {
        const wdMatch = /https?:\/\/[^/"]+myworkdayjobs\.com\/[^/"]+/i.exec(html);
        const boardUrl = wdMatch ? wdMatch[0] : careerUrl;
        return { provider: 'workday', boardUrl };
      }

      if (htmlLower.includes('teamtailor.com') || htmlLower.includes('teamtailor-embed')) {
        return { provider: 'teamtailor', boardUrl: careerUrl };
      }

      if (htmlLower.includes('smartrecruiters.com') || htmlLower.includes('jobs.smartrecruiters.com')) {
        return { provider: 'smartrecruiters', boardUrl: careerUrl };
      }

      if (htmlLower.includes('jobvite.com') || htmlLower.includes('jobs.jobvite.com')) {
        return { provider: 'jobvite', boardUrl: careerUrl };
      }

      if (htmlLower.includes('bamboohr.com') || htmlLower.includes('bamboohr.co.uk')) {
        return { provider: 'bamboohr', boardUrl: careerUrl };
      }

      if (htmlLower.includes('recruitee.com') || htmlLower.includes('widget.recruitee.com')) {
        return { provider: 'recruitee', boardUrl: careerUrl };
      }

      if (htmlLower.includes('icims.com') || htmlLower.includes('jobs-icims.com')) {
        return { provider: 'icims', boardUrl: careerUrl };
      }

      return { provider: 'unknown', boardUrl: '' };
    } catch (e) {
      console.error(`Detect ATS error for careerUrl ${careerUrl}:`, e);
      return { provider: 'unknown', boardUrl: '' };
    }
  }

  /**
   * Discover a company, crawl its page, extract signatures and save config.
   * @param {string} name
   * @param {string} domain
   * @returns {Promise<Object>} Discovered database company details.
   */
  async discoverCompany(name, domain) {
    try {
      const normalizedName = name.toUpperCase().trim();
      const careerUrl = await this.crawlDomain(domain);
      const { provider, boardUrl } = await this.detectATS(careerUrl);

      const updateData = {
        name: normalizedName,
        careerUrl,
        provider,
        boardUrl: boardUrl || careerUrl,
        lastScannedAt: new Date(),
        nextScanAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Re-scan in 7 days
      };

      const company = await Company.findOneAndUpdate(
        { name: normalizedName },
        updateData,
        { upsert: true, new: true }
      );
      
      console.log(`Discovered company ${normalizedName}: provider=${provider}, careerUrl=${careerUrl}`);
      return company;
    } catch (e) {
      console.error(`discoverCompany failed for ${name}:`, e);
      throw e;
    }
  }
}

module.exports = new CompanyDiscoveryService();
