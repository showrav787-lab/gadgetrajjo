import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ProductCard } from '@/components/ProductCard';
import { Pagination } from '@/components/Pagination';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { fbqTrack } from '@/fbpixel';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  images?: string[] | null;
  stock: number;
  priority?: number; // Lower number = higher priority (1 appears first)
  created_at?: string;
}

const ITEMS_PER_PAGE = 12;

const Home = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>('priority');

  useEffect(() => {
    fetchProducts();
  }, []);

  // FB Pixel ViewContent event when products load
  useEffect(() => {
    if (products.length > 0) {
      fbqTrack("ViewContent", {
        content_category: "Home Page",
        content_ids: products.map((p) => p.id),
        content_type: "product_group",
      });
    }
  }, [products]);

  const fetchProducts = async () => {
    try {
      // Try with priority ordering first
      let data: any[] | null = null;
      let error: any = null;

      const firstAttempt = await supabase
        .from('products')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      data = firstAttempt.data;
      error = firstAttempt.error;

      if (error) {
        // If error is about priority or images/column missing, try fallback without priority
        const errorMessage = error.message || '';
        if (
          errorMessage.includes('priority') ||
          errorMessage.includes('images') ||
          errorMessage.includes('column') ||
          errorMessage.includes('does not exist')
        ) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('products')
            .select('id, name, description, price, image_url, stock, created_at')
            .order('created_at', { ascending: false });

          if (fallbackError) throw fallbackError;
          // Add images and priority from image_url
          const productsWithImages = (fallbackData || []).map((p: any): Product => ({
            ...p,
            images: p.image_url ? [p.image_url] : undefined,
            priority: p.priority ?? 999,
          }));
          setProducts(productsWithImages);
          setFilteredProducts(productsWithImages);
        } else {
          throw error;
        }
      } else {
        // Successfully fetched, parse images
        const products = (data || []).map((p: any): Product => {
          let images: string[] | undefined = undefined;
          if (p.images !== undefined && p.images !== null) {
            if (typeof p.images === 'string') {
              try {
                const parsed = JSON.parse(p.images);
                images = Array.isArray(parsed) ? parsed.filter((img: any) => img && typeof img === 'string' && img.trim()) : [p.images].filter((img: string) => img && img.trim());
              } catch {
                images = p.images && p.images.trim() ? [p.images] : undefined;
              }
            } else if (Array.isArray(p.images)) {
              images = p.images.filter((img: any) => img && typeof img === 'string' && img.trim());
            }
          }

          // Fallback to image_url if no images array
          if ((!images || images.length === 0) && p.image_url && p.image_url.trim()) {
            images = [p.image_url];
          }

          return {
            ...p,
            images: images && images.length > 0 ? images : undefined,
            priority: p.priority ?? 999,
          };
        });
        setProducts(products);
        setFilteredProducts(products);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    // Track FB Pixel Search event
    fbqTrack("Search", {
      search_string: query,
    });
  
    setCurrentPage(1); // Reset to first page on search
  
    if (!query.trim()) {
      setFilteredProducts(products);
      return;
    }
  
    const filtered = products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.description?.toLowerCase().includes(query.toLowerCase())
    );
  
    setFilteredProducts(filtered);
  };

  // Apply sorting to filtered products
  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts];

    switch (sortBy) {
      case 'priority':
        return sorted.sort((a, b) => {
          const priorityA = a.priority ?? 999;
          const priorityB = b.priority ?? 999;
          if (priorityA !== priorityB) return priorityA - priorityB;
          // If priorities are equal, sort by created_at DESC
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
      case 'price-low':
        return sorted.sort((a, b) => a.price - b.price);
      case 'price-high':
        return sorted.sort((a, b) => b.price - a.price);
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateA - dateB;
        });
      default:
        return sorted;
    }
  }, [filteredProducts, sortBy]);

  // Pagination logic
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedProducts.slice(startIndex, endIndex);
  }, [sortedProducts, currentPage]);

  const totalPages = Math.ceil(sortedProducts.length / ITEMS_PER_PAGE);

  useEffect(() => {
    // Reset to page 1 when sorted products change
    setCurrentPage(1);
  }, [sortedProducts.length, sortBy]);

  return (
    <div className="min-h-screen flex flex-col page-transition relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-1/2 w-72 h-72 bg-primary/15 rounded-full blur-3xl animate-pulse" />

        {/* Floating Particles */}
        <div className="absolute top-20 left-10 w-2 h-2 bg-primary/30 rounded-full animate-float" />
        <div className="absolute top-40 right-20 w-3 h-3 bg-accent/30 rounded-full animate-float" />
        <div className="absolute bottom-40 left-20 w-2 h-2 bg-primary/30 rounded-full animate-float" />
        <div className="absolute top-60 left-1/2 w-2 h-2 bg-accent/30 rounded-full animate-float" />
        <div className="absolute bottom-20 right-10 w-3 h-3 bg-primary/30 rounded-full animate-float" />

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-30" />
      </div>

              <Header onSearch={handleSearch} />

              <main className="flex-1 container mx-auto px-4 py-4 sm:py-8 animate-fade-in relative z-10">
                {/* Sorting Controls */}
                <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="sort" className="text-sm font-medium whitespace-nowrap">
                      সাজান:
                    </Label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger id="sort" className="w-[200px]">
                        <SelectValue placeholder="সাজান" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">প্রাধান্য (Default)</SelectItem>
                        <SelectItem value="price-low">মূল্য: কম থেকে বেশি</SelectItem>
                        <SelectItem value="price-high">মূল্য: বেশি থেকে কম</SelectItem>
                        <SelectItem value="name-asc">নাম: A-Z</SelectItem>
                        <SelectItem value="name-desc">নাম: Z-A</SelectItem>
                        <SelectItem value="newest">নতুন প্রথম</SelectItem>
                        <SelectItem value="oldest">পুরাতন প্রথম</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {sortedProducts.length} টি পণ্য পাওয়া গেছে
                  </div>
                </div>

                <div className="text-center mb-8 sm:mb-12 space-y-4 relative">
          {/* Decorative Elements */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-8 w-32 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent animate-fade-in relative inline-block">
            <span className="relative z-10">আমাদের পণ্য সমূহ</span>
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-2xl -z-10 animate-pulse" />
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto bengali-font">
            আপনার প্রয়োজনীয় সব পণ্য একই জায়গায়
          </p>

          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-4 w-24 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
        </div>

        {loading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">পণ্য লোড হচ্ছে...</p>
            </div>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-xl sm:text-2xl text-muted-foreground font-semibold mb-2">কোন পণ্য পাওয়া যায়নি</p>
            <p className="text-sm text-muted-foreground">অনুগ্রহ করে অন্য কীওয়ার্ড দিয়ে খুঁজুন</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {paginatedProducts.map((product, index) => (
                <div
                  key={product.id}
                  className="animate-fade-in opacity-0"
                >
                  <ProductCard {...product} />
                </div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={ITEMS_PER_PAGE}
              totalItems={sortedProducts.length}
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Home;