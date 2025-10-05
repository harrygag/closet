// Analytics Service - Profit trends, category breakdown, inventory velocity
class AnalyticsService {
    constructor(items) {
        this.items = items || [];
    }

    // Total active inventory value (sum of all Active items' sellingPrice)
    getTotalActiveValue() {
        return this.items
            .filter(item => item.status === 'Active')
            .reduce((sum, item) => sum + (parseFloat(item.sellingPrice) || 0), 0);
    }

    // Total profit from SOLD items (sum of netProfit for SOLD items)
    getTotalSoldProfit() {
        return this.items
            .filter(item => item.status === 'SOLD')
            .reduce((sum, item) => {
                const cost = parseFloat(item.costBasis) || 0;
                const price = parseFloat(item.sellingPrice) || 0;
                return sum + (price - cost);
            }, 0);
    }

    // Item counts by status
    getItemCounts() {
        const counts = {
            active: 0,
            inactive: 0,
            sold: 0,
            total: this.items.length
        };

        this.items.forEach(item => {
            if (item.status === 'Active') counts.active++;
            else if (item.status === 'Inactive') counts.inactive++;
            else if (item.status === 'SOLD') counts.sold++;
        });

        return counts;
    }

    // Average profit per SOLD item
    getAverageProfit() {
        const soldItems = this.items.filter(item => item.status === 'SOLD');
        if (soldItems.length === 0) return 0;

        const totalProfit = soldItems.reduce((sum, item) => {
            const cost = parseFloat(item.costBasis) || 0;
            const price = parseFloat(item.sellingPrice) || 0;
            return sum + (price - cost);
        }, 0);

        return totalProfit / soldItems.length;
    }

    // Profit trends by month (for line chart)
    getProfitTrends() {
        const soldItems = this.items.filter(item => item.status === 'SOLD' && item.dateAdded);

        // Group by month
        const monthlyData = {};
        soldItems.forEach(item => {
            const date = new Date(item.dateAdded);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { profit: 0, count: 0 };
            }

            const cost = parseFloat(item.costBasis) || 0;
            const price = parseFloat(item.sellingPrice) || 0;
            monthlyData[monthKey].profit += (price - cost);
            monthlyData[monthKey].count++;
        });

        // Convert to sorted array
        const sorted = Object.keys(monthlyData)
            .sort()
            .map(monthKey => ({
                month: monthKey,
                profit: monthlyData[monthKey].profit,
                count: monthlyData[monthKey].count
            }));

        return sorted;
    }

    // Category breakdown (for doughnut chart)
    getCategoryBreakdown() {
        const categories = {};

        this.items.forEach(item => {
            const category = item.type || 'Uncategorized';
            if (!categories[category]) {
                categories[category] = {
                    count: 0,
                    totalValue: 0,
                    soldCount: 0,
                    soldProfit: 0
                };
            }

            categories[category].count++;
            categories[category].totalValue += parseFloat(item.sellingPrice) || 0;

            if (item.status === 'SOLD') {
                categories[category].soldCount++;
                const cost = parseFloat(item.costBasis) || 0;
                const price = parseFloat(item.sellingPrice) || 0;
                categories[category].soldProfit += (price - cost);
            }
        });

        // Convert to array and sort by count
        return Object.keys(categories)
            .map(name => ({
                name,
                count: categories[name].count,
                totalValue: categories[name].totalValue,
                soldCount: categories[name].soldCount,
                soldProfit: categories[name].soldProfit
            }))
            .sort((a, b) => b.count - a.count);
    }

    // Average days to sell (for bar chart)
    getAverageDaysToSell() {
        const soldItems = this.items.filter(item => item.status === 'SOLD' && item.dateAdded);

        if (soldItems.length === 0) {
            return { overall: 0, byCategory: [] };
        }

        // Calculate overall average
        const today = new Date();
        const totalDays = soldItems.reduce((sum, item) => {
            const dateAdded = new Date(item.dateAdded);
            const daysToSell = Math.floor((today - dateAdded) / (1000 * 60 * 60 * 24));
            return sum + daysToSell;
        }, 0);
        const overall = Math.floor(totalDays / soldItems.length);

        // Calculate by category
        const categoryDays = {};
        soldItems.forEach(item => {
            const category = item.type || 'Uncategorized';
            const dateAdded = new Date(item.dateAdded);
            const daysToSell = Math.floor((today - dateAdded) / (1000 * 60 * 60 * 24));

            if (!categoryDays[category]) {
                categoryDays[category] = { totalDays: 0, count: 0 };
            }
            categoryDays[category].totalDays += daysToSell;
            categoryDays[category].count++;
        });

        const byCategory = Object.keys(categoryDays)
            .map(name => ({
                name,
                averageDays: Math.floor(categoryDays[name].totalDays / categoryDays[name].count)
            }))
            .sort((a, b) => a.averageDays - b.averageDays);

        return { overall, byCategory };
    }

    // Get all analytics in one call
    getAllAnalytics() {
        return {
            totals: {
                activeValue: this.getTotalActiveValue(),
                soldProfit: this.getTotalSoldProfit(),
                counts: this.getItemCounts(),
                averageProfit: this.getAverageProfit()
            },
            profitTrends: this.getProfitTrends(),
            categoryBreakdown: this.getCategoryBreakdown(),
            velocity: this.getAverageDaysToSell()
        };
    }
}
