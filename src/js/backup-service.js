// Backup Service - Auto-backup system for data protection
class BackupService {
  static BACKUP_KEY_PREFIX = 'closet_backup_';
  static MAX_BACKUPS = 5;
  static BACKUP_INTERVAL = 10; // Auto-backup every 10 items

  static createBackup(items) {
    try {
      const backup = {
        timestamp: new Date().toISOString(),
        itemCount: items.length,
        items: items,
        user: AuthService.isLoggedIn() ? AuthService.getCurrentUser().username : 'guest'
      };

      const backupKey = `${this.BACKUP_KEY_PREFIX}${Date.now()}`;
      localStorage.setItem(backupKey, JSON.stringify(backup));

      // Clean old backups
      this.cleanOldBackups();

      console.log(`✅ Backup created: ${backup.itemCount} items at ${backup.timestamp}`);
      return { success: true, backupKey: backupKey };
    } catch (e) {
      console.error('Backup failed:', e);
      return { success: false, error: e };
    }
  }

  static getAllBackups() {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.BACKUP_KEY_PREFIX)) {
        try {
          const backup = JSON.parse(localStorage.getItem(key));
          backups.push({ key: key, ...backup });
        } catch (e) {
          console.error('Failed to parse backup:', key);
        }
      }
    }
    // Sort by timestamp descending (newest first)
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  static restoreBackup(backupKey) {
    try {
      const backupData = localStorage.getItem(backupKey);
      if (!backupData) {
        return { success: false, error: 'Backup not found' };
      }

      const backup = JSON.parse(backupData);
      return { success: true, items: backup.items, timestamp: backup.timestamp };
    } catch (e) {
      console.error('Restore failed:', e);
      return { success: false, error: e };
    }
  }

  static cleanOldBackups() {
    const backups = this.getAllBackups();
    if (backups.length > this.MAX_BACKUPS) {
      // Delete oldest backups
      const toDelete = backups.slice(this.MAX_BACKUPS);
      toDelete.forEach(backup => {
        localStorage.removeItem(backup.key);
        console.log(`🗑️ Deleted old backup from ${backup.timestamp}`);
      });
    }
  }

  static shouldAutoBackup(itemCount) {
    // Auto-backup every BACKUP_INTERVAL items
    return itemCount > 0 && itemCount % this.BACKUP_INTERVAL === 0;
  }

  static downloadBackup(items) {
    const backup = {
      exportDate: new Date().toISOString(),
      appVersion: '1.0',
      itemCount: items.length,
      items: items
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `closet-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return { success: true };
  }
}
