// Import Service - Import data from JSON files
class ImportService {
  static importFromJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target.result);

          // Handle different formats
          let items;
          if (Array.isArray(content)) {
            items = content;
          } else if (content.items && Array.isArray(content.items)) {
            items = content.items;
          } else {
            reject({ success: false, error: 'Invalid file format' });
            return;
          }

          // Validate items
          const validatedItems = items.filter(item => item.name || item.id);

          if (validatedItems.length === 0) {
            reject({ success: false, error: 'No valid items found' });
            return;
          }

          resolve({ success: true, items: validatedItems, count: validatedItems.length });

        } catch (error) {
          reject({ success: false, error: 'Failed to parse JSON file' });
        }
      };

      reader.onerror = () => {
        reject({ success: false, error: 'Failed to read file' });
      };

      reader.readAsText(file);
    });
  }
}
