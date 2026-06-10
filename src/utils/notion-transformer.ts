/**
 * Transform Notion database JSON export into Item format
 * This uses the static notion-items.json file (no API calls needed)
 */

import type { Item } from '../types/item';

interface NotionPage {
  id: string;
  icon?: {
    type: 'emoji' | 'file';
    emoji?: string;
    file?: {
      url: string;
    };
  };
  properties: {
    Name: {
      title: Array<{
        plain_text: string;
      }>;
    };
    Select?: {
      select: {
        name: string;
      } | null;
    };
    Status?: {
      select: {
        name: string;
      } | null;
    };
    'Hanger Status'?: {
      select: {
        name: string;
      } | null;
    };
    'Hanger ID'?: {
      select: {
        name: string;
      } | null;
    };
    Tags?: {
      multi_select: Array<{
        name: string;
      }>;
    };
    'eBay Fees'?: {
      number: number | null;
    };
    'Net Profit'?: {
      number: number | null;
    };
    Date?: {
      date: {
        start: string;
      } | null;
    };
    'Files & media'?: {
      files: Array<{
        file?: {
          url: string;
        };
      }>;
    };
  };
  created_time: string;
}

interface NotionResponse {
  results: NotionPage[];
}

/**
 * Transform a single Notion page into an Item
 */
function transformNotionPageToItem(page: NotionPage): Item | null {
  // Get the name from title
  const name = page.properties.Name?.title?.[0]?.plain_text;
  
  // Skip items without names or with template names
  if (!name || name.startsWith('Template') || name.length === 0 || name.includes('🎮')) {
    return null;
  }

  // Get image URL from icon or files
  let imageUrl: string | undefined;
  if (page.icon?.type === 'file' && page.icon.file?.url) {
    imageUrl = page.icon.file.url;
  } else if (page.properties['Files & media']?.files?.[0]?.file?.url) {
    imageUrl = page.properties['Files & media'].files[0].file.url;
  }

  // Get size
  const size = page.properties.Select?.select?.name || 'N/A';

  // Get status
  const notionStatus = page.properties.Status?.select?.name;
  const status = (notionStatus === 'Active' || notionStatus === 'Inactive' || notionStatus === 'SOLD') 
    ? notionStatus 
    : 'Active';

  // Get tags
  const tags = page.properties.Tags?.multi_select?.map(t => t.name as any) || [];

  // Get hanger info
  const hangerStatus = page.properties['Hanger Status']?.select?.name || 'Available';
  const hangerId = page.properties['Hanger ID']?.select?.name || '';

  // Get financial info
  const ebayFees = page.properties['eBay Fees']?.number || 0;
  const netProfit = page.properties['Net Profit']?.number || 0;

  // Generate item
  return {
    id: page.id,
    name,
    size,
    status,
    hangerStatus,
    hangerId,
    tags,
    ebayUrl: '', // We don't have this in Notion, can be added later
    marketplaceUrls: [],
    imageUrl,
    costPrice: 0, // Calculate from net profit and selling price if needed
    sellingPrice: 0, // Not in current Notion schema
    ebayFees,
    netProfit,
    dateField: page.properties.Date?.date?.start || '',
    notes: '',
    dateAdded: page.created_time,
    position: undefined,
  };
}

/**
 * Transform Notion JSON export into Items array
 */
export function transformNotionData(notionData: NotionResponse): Item[] {
  return notionData.results
    .map(transformNotionPageToItem)
    .filter((item): item is Item => item !== null);
}
