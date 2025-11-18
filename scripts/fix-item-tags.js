import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hqmujfbifgpcyqmpuwil.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbXVqZmJpZmdwY3lxbXB1d2lsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ2NjQ3NiwiZXhwIjoyMDc2MDQyNDc2fQ.z-HPpEXneiERG3GzLqNcHRHu9L3Y-GcxKzRdsUBYIo';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const userId = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4';

async function fixItemTags() {
  console.log('🏷️  Fixing item tags...');
  
  try {
    // Fetch all items for the user
    const { data: items, error: fetchError } = await supabase
      .from('Item')
      .select('id, title, category, normalizedTags')
      .eq('user_uuid', userId);
    
    if (fetchError) {
      console.error('❌ Error fetching items:', fetchError);
      return;
    }
    
    console.log(`📦 Found ${items.length} items to categorize`);
    
    let updated = 0;
    
    for (const item of items) {
      let tags = [];
      const title = (item.title || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      
      // Categorize based on title and category
      if (title.includes('hoodie') || title.includes('sweatshirt') || category.includes('hoodie') || category.includes('sweatshirt')) {
        tags = ['Hoodies'];
      } else if (title.includes('jersey') || category.includes('jersey')) {
        tags = ['Jerseys'];
      } else if (title.includes('polo') || category.includes('polo')) {
        tags = ['Polos'];
      } else if (title.includes('pullover') || title.includes('jacket') || title.includes('coat') || title.includes('windbreaker') ||
                 category.includes('pullover') || category.includes('jacket') || category.includes('coat') || category.includes('windbreaker')) {
        tags = ['Pullovers & Jackets'];
      } else if (title.includes('pant') || title.includes('short') || title.includes('jean') || title.includes('trouser') ||
                 category.includes('pant') || category.includes('short') || category.includes('jean') || category.includes('trouser')) {
        tags = ['Bottoms'];
      } else if (title.includes('shirt') || title.includes('tee') || title.includes('t-shirt') ||
                 category.includes('shirt') || category.includes('tee') || category.includes('t-shirt')) {
        tags = ['T-Shirts'];
      } else {
        // Default to T-Shirts for uncategorized items
        tags = ['T-Shirts'];
      }
      
      // Update the item
      const { error: updateError } = await supabase
        .from('Item')
        .update({ normalizedTags: tags })
        .eq('id', item.id);
      
      if (updateError) {
        console.error(`❌ Error updating item ${item.id}:`, updateError);
      } else {
        updated++;
        if (updated % 10 === 0) {
          console.log(`✅ Updated ${updated}/${items.length} items...`);
        }
      }
    }
    
    console.log(`✅ Successfully updated ${updated} items!`);
    
    // Show summary
    const { data: summary } = await supabase
      .from('Item')
      .select('normalizedTags')
      .eq('user_uuid', userId);
    
    if (summary) {
      const categoryCounts = {};
      summary.forEach(item => {
        const tag = item.normalizedTags?.[0] || 'Uncategorized';
        categoryCounts[tag] = (categoryCounts[tag] || 0) + 1;
      });
      
      console.log('\n📊 Category Distribution:');
      Object.entries(categoryCounts).forEach(([category, count]) => {
        console.log(`  ${category}: ${count} items`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixItemTags();

