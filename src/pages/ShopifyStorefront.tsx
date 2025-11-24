import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ShoppingCart, Heart, Search, Filter, X, Sparkles, Zap, TrendingUp, Eye, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { triggerConfetti, triggerCartAnimation } from '../utils/confetti';

interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  images: Array<{ url: string; altText?: string }>;
  variants: Array<{
    id: string;
    price: { amount: string; currencyCode: string };
    availableForSale: boolean;
  }>;
  vendor: string;
  productType: string;
  tags: string[];
}

interface CartItem {
  variantId: string;
  quantity: number;
  product: ShopifyProduct;
}

export default function ShopifyStorefront() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ShopifyProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showCart, setShowCart] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load products from Shopify
  useEffect(() => {
    loadProducts();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = products;

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => p.productType === selectedCategory);
    }

    setFilteredProducts(filtered);
  }, [products, searchQuery, selectedCategory]);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      // This would call your Shopify Storefront API
      const response = await fetch('/api/shopify/get-products');
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      toast.error('Failed to load products');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const addToCart = (product: ShopifyProduct) => {
    if (!product.variants[0]?.availableForSale) {
      toast.error('This item is not available');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.variantId === product.variants[0].id);
      if (existing) {
        return prev.map(item =>
          item.variantId === product.variants[0].id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { variantId: product.variants[0].id, quantity: 1, product }];
    });

    // Trigger confetti and cart animation
    triggerConfetti();
    const cartButton = document.querySelector('.cart-button');
    if (cartButton) triggerCartAnimation(cartButton as HTMLElement);

    toast.success('🎉 Added to cart!', {
      description: product.title,
      duration: 2000,
      style: {
        background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
        color: 'white',
        fontWeight: 'bold'
      }
    });
  };

  const removeFromCart = (variantId: string) => {
    setCart(prev => prev.filter(item => item.variantId !== variantId));
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.product.variants[0].price.amount) * item.quantity,
    0
  );

  const handleCheckout = async () => {
    try {
      const lineItems = cart.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity
      }));

      const response = await fetch('/api/shopify/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems })
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        // Redirect to Shopify checkout
        window.location.href = data.checkoutUrl;
      } else {
        toast.error('Failed to create checkout');
      }
    } catch (error) {
      toast.error('Checkout failed');
      console.error(error);
    }
  };

  const categories = ['All', ...new Set(products.map(p => p.productType))];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 relative overflow-hidden">
      {/* Animated Background Particles */}
      <div className="fixed inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-amber-300/20 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{
              duration: Math.random() * 10 + 20,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-amber-100 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <motion.div
                className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.6 }}
              >
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-amber-600 via-orange-600 to-pink-600 bg-clip-text text-transparent">
                  Closet BV
                </h1>
                <p className="text-xs text-amber-600 font-medium">Premium Vintage Fashion</p>
              </div>
            </motion.div>

            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 rounded-full border border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition-all bg-white/50"
                />
              </div>

              {/* Cart Button */}
              <motion.button
                onClick={() => setShowCart(true)}
                className="cart-button relative p-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 transition-all shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <ShoppingCart className="w-6 h-6 text-white" />
                {cart.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-gradient-to-r from-pink-500 to-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-lg"
                  >
                    {cart.length}
                  </motion.span>
                )}
                {cart.length > 0 && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-white"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </motion.button>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg'
                    : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container mx-auto px-4 py-16"
      >
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="inline-block mb-4"
          >
            <span className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-sm font-bold shadow-lg">
              ✨ NEW ARRIVALS DAILY
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-6xl md:text-7xl font-black mb-6 leading-tight"
          >
            <span className="bg-gradient-to-r from-amber-600 via-orange-600 to-pink-600 bg-clip-text text-transparent">
              Discover Your
            </span>
            <br />
            <motion.span
              animate={{ 
                backgroundPosition: ['0%', '100%', '0%'],
              }}
              transition={{ duration: 5, repeat: Infinity }}
              className="bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 bg-clip-text text-transparent bg-[length:200%_auto]"
            >
              Perfect Style
            </motion.span>
          </motion.h2>
          
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xl text-gray-600 mb-8"
          >
            Curated vintage and contemporary pieces for the fashion-forward individual
          </motion.p>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap gap-4 justify-center"
          >
            {['New In', 'Best Sellers', 'Sale'].map((label, i) => (
              <motion.button
                key={label}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-white rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all border-2 border-amber-200"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                {label}
              </motion.button>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* Stats Section */}
      <motion.section
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="container mx-auto px-4 py-8"
      >
        <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { label: 'Products', value: filteredProducts.length, icon: Sparkles },
            { label: 'Happy Customers', value: '10K+', icon: Heart },
            { label: 'Items Sold', value: '25K+', icon: TrendingUp },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, type: 'spring' }}
              whileHover={{ scale: 1.05 }}
              className="bg-white rounded-2xl p-6 text-center shadow-lg"
            >
              <stat.icon className="w-8 h-8 mx-auto mb-2 text-amber-600" />
              <div className="text-3xl font-black text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-600">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Products Grid */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white/50 rounded-2xl h-96 animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-2xl text-amber-600">No products found</p>
            <p className="text-amber-500 mt-2">Try adjusting your filters</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            layout
          >
            <AnimatePresence>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={() => addToCart(product)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
            />
            <motion.div
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
            >
              <div className="p-6 border-b border-amber-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-amber-900">Your Cart</h2>
                  <button
                    onClick={() => setShowCart(false)}
                    className="p-2 hover:bg-amber-100 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {cart.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="w-16 h-16 mx-auto text-amber-300 mb-4" />
                    <p className="text-amber-600">Your cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cart.map((item) => (
                      <div
                        key={item.variantId}
                        className="flex gap-4 p-4 bg-amber-50 rounded-xl"
                      >
                        <img
                          src={item.product.images[0]?.url || '/placeholder.png'}
                          alt={item.product.title}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-amber-900">{item.product.title}</h3>
                          <p className="text-amber-600">
                            ${item.product.variants[0].price.amount} × {item.quantity}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.variantId)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-amber-100">
                  <div className="flex justify-between mb-4">
                    <span className="text-lg font-semibold">Total:</span>
                    <span className="text-2xl font-bold text-amber-900">
                      ${cartTotal.toFixed(2)}
                    </span>
                  </div>
                  <motion.button 
                    onClick={handleCheckout}
                    className="relative w-full py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white rounded-xl font-bold overflow-hidden group"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-amber-500"
                      animate={{ x: ['0%', '100%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <Rocket className="w-5 h-5" />
                      Proceed to Checkout
                      <Sparkles className="w-5 h-5" />
                    </span>
                  </motion.button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductCard({ product, onAddToCart }: { product: ShopifyProduct; onAddToCart: () => void }) {
  const [isLiked, setIsLiked] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [views, setViews] = useState(Math.floor(Math.random() * 100) + 20);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Mouse tracking for 3D tilt effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [15, -15]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-15, 15]), { stiffness: 300, damping: 30 });
  
  const variant = product.variants[0];
  const available = variant?.availableForSale ?? false;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const x = (e.clientX - centerX) / rect.width;
    const y = (e.clientY - centerY) / rect.height;
    
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    if (!isLiked) {
      // Confetti effect
      toast.success('Added to favorites!', {
        icon: '❤️',
        duration: 2000
      });
    }
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, scale: 0.8, rotateY: -90 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.8, rotateY: 90 }}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group relative bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all cursor-pointer"
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
    >
      {/* Shine effect overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none z-10"
        initial={{ x: '-100%' }}
        whileHover={{ x: '200%' }}
        transition={{ duration: 0.6 }}
      />

      {/* Image Container with Parallax */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100">
        <motion.img
          src={product.images[0]?.url || '/placeholder.png'}
          alt={product.images[0]?.altText || product.title}
          className="w-full h-full object-cover"
          whileHover={{ scale: 1.15 }}
          transition={{ duration: 0.4 }}
        />

        {/* Floating badges */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute top-4 left-4 flex flex-col gap-2"
        >
          {Math.random() > 0.7 && (
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="bg-gradient-to-r from-pink-500 to-red-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg"
            >
              <Zap className="w-3 h-3" />
              HOT
            </motion.div>
          )}
          {Math.random() > 0.6 && (
            <motion.div
              whileHover={{ scale: 1.1, rotate: -5 }}
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg"
            >
              <TrendingUp className="w-3 h-3" />
              TRENDING
            </motion.div>
          )}
        </motion.div>

        {/* Interactive Like Button */}
        <motion.button
          onClick={handleLike}
          className="absolute top-4 right-4 p-3 bg-white/95 backdrop-blur-md rounded-full hover:bg-white transition-colors shadow-lg"
          whileHover={{ scale: 1.2, rotate: 10 }}
          whileTap={{ scale: 0.9 }}
        >
          <motion.div
            animate={isLiked ? { scale: [1, 1.5, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <Heart
              className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'}`}
            />
          </motion.div>
        </motion.button>

        {/* Quick View Button */}
        <motion.button
          onClick={() => setIsFlipped(!isFlipped)}
          initial={{ opacity: 0, y: 20 }}
          whileHover={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 right-4 p-3 bg-amber-500 text-white rounded-full shadow-lg"
          whileTap={{ scale: 0.95 }}
        >
          <Eye className="w-5 h-5" />
        </motion.button>

        {/* Views Counter */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs flex items-center gap-1"
        >
          <Eye className="w-3 h-3" />
          {views} views
        </motion.div>

        {!available && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.span
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="bg-white px-6 py-3 rounded-full font-bold text-lg shadow-xl"
            >
              Sold Out
            </motion.span>
          </motion.div>
        )}
      </div>

      {/* Content with Animated Hover */}
      <motion.div
        className="p-5"
        style={{ transform: 'translateZ(50px)' }}
      >
        <motion.p
          className="text-xs text-amber-600 font-bold mb-1 uppercase tracking-wider"
          whileHover={{ x: 5 }}
        >
          {product.vendor}
        </motion.p>
        
        <h3 className="font-bold text-gray-900 mb-3 line-clamp-2 text-lg">
          {product.title}
        </h3>

        {/* Animated Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {product.tags.slice(0, 3).map((tag, i) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.1, rotate: 3 }}
              className="text-xs px-3 py-1 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 rounded-full font-semibold"
            >
              {tag}
            </motion.span>
          ))}
        </div>

        {/* Price & Add to Cart */}
        <div className="flex items-center justify-between">
          <motion.div
            whileHover={{ scale: 1.1 }}
            className="flex flex-col"
          >
            <span className="text-xs text-gray-500 line-through">
              ${(parseFloat(variant?.price.amount) * 1.2).toFixed(2)}
            </span>
            <span className="text-3xl font-black bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              ${variant?.price.amount}
            </span>
          </motion.div>
          
          <motion.button
            onClick={onAddToCart}
            disabled={!available}
            className="group/btn relative px-6 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white rounded-2xl font-bold overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-pink-500 via-orange-500 to-amber-500"
              initial={{ x: '100%' }}
              whileHover={{ x: 0 }}
              transition={{ duration: 0.3 }}
            />
            <span className="relative z-10 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Add
            </span>
          </motion.button>
        </div>

        {/* Sparkle effect on hover */}
        <motion.div
          className="absolute -top-2 -right-2 pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
        >
          <Sparkles className="w-8 h-8 text-amber-400" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

