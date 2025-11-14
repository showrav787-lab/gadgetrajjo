import { fbqTrack } from '@/fbpixel';

// Strict helper to get the first valid image URL
function getFirstImageUrl(imageData: any): string | null {
  if (!imageData) return null;

  const validImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'];

  const isValidImage = (url: string) => {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return validImageExts.some(ext => lower.endsWith(ext));
  };

  let urls: string[] = [];

  // If it's already an array
  if (Array.isArray(imageData)) {
    urls = imageData;
  } else if (typeof imageData === 'string') {
    try {
      const parsed = JSON.parse(imageData);
      if (Array.isArray(parsed)) urls = parsed;
      else urls = [imageData]; // single string
    } catch {
      urls = [imageData]; // not JSON, just a single URL string
    }
  }

  // Filter only valid image URLs
  const validImages = urls.filter(isValidImage);

  // Return the first valid image or null
  return validImages.length > 0 ? validImages[0] : null;
}
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trash2, Plus, Minus, CheckCircle2, Loader2 } from 'lucide-react';

const Cart = () => {
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    location: 'inside_dhaka' as 'inside_dhaka' | 'outside_dhaka',
  });

  const [deliveryCharges, setDeliveryCharges] = useState({
    inside_dhaka: 60,
    outside_dhaka: 120,
  });

  useEffect(() => {
    const fetchDeliveryCharges = async () => {
      try {
        const { data, error } = await supabase
          .from('delivery_charges' as any)
          .select('*');

        if (error) {
          console.warn('Delivery charges not found, using defaults');
          return;
        }

        if (data && data.length > 0) {
          const charges: { inside_dhaka: number; outside_dhaka: number } = {
            inside_dhaka: 60,
            outside_dhaka: 120,
          };
          
          data.forEach((item: any) => {
            if (item.location_type === 'inside_dhaka') {
              charges.inside_dhaka = parseFloat(item.charge);
            } else if (item.location_type === 'outside_dhaka') {
              charges.outside_dhaka = parseFloat(item.charge);
            }
          });
          
          setDeliveryCharges(charges);
        }
      } catch (error) {
        console.error('Error fetching delivery charges:', error);
      }
    };

    fetchDeliveryCharges();
  }, []);

  const deliveryCharge = formData.location === 'inside_dhaka' 
    ? deliveryCharges.inside_dhaka 
    : deliveryCharges.outside_dhaka;
  const finalTotal = totalPrice + deliveryCharge;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (items.length === 0) {
      toast.error('আপনার কার্ট খালি!');
      return;
    }

    for (const item of items) {
      if (!item.id || !item.name || item.price <= 0 || item.quantity <= 0) {
        toast.error('কার্টে একটি অবৈধ পণ্য আছে');
        return;
      }
    }

    if (!formData.name || !formData.name.trim()) {
      toast.error('নাম প্রয়োজন');
      return;
    }

    if (!formData.phone || !formData.phone.trim()) {
      toast.error('ফোন নম্বর প্রয়োজন');
      return;
    }

    const phoneRegex = /^[0-9+\-\s()]+$/;
    if (!phoneRegex.test(formData.phone.trim())) {
      toast.error('সঠিক ফোন নম্বর দিন');
      return;
    }

    if (!formData.address || !formData.address.trim()) {
      toast.error('ঠিকানা প্রয়োজন');
      return;
    }

    setLoading(true);

    try {
      const productIds = items.map(item => item.id);
      const { data: existingProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, stock, price')
        .in('id', productIds);

      if (productsError) throw new Error(productsError.message || 'পণ্য যাচাই করতে সমস্যা হয়েছে');

      if (!existingProducts || existingProducts.length !== items.length) {
        const existingIds = new Set(existingProducts?.map(p => p.id) || []);
        const missingItems = items.filter(item => !existingIds.has(item.id));
        if (missingItems.length > 0) {
          toast.error(`কিছু পণ্য আর পাওয়া যায় না: ${missingItems.map(i => i.name).join(', ')}`);
          missingItems.forEach(item => removeItem(item.id));
          setLoading(false);
          return;
        }
      }

      const outOfStockItems: string[] = [];
      for (const item of items) {
        const product = existingProducts?.find(p => p.id === item.id);
        if (product && product.stock < item.quantity) {
          outOfStockItems.push(`${product.name} (স্টক: ${product.stock})`);
        }
      }

      if (outOfStockItems.length > 0) {
        toast.error(`স্টক শেষ: ${outOfStockItems.join(', ')}`);
        setLoading(false);
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          location_type: formData.location,
          total_amount: parseFloat(finalTotal.toFixed(2)),
          status: 'pending',
        })
        .select('id')
        .single();

      if (orderError) throw new Error(orderError.message || 'অর্ডার তৈরি করতে সমস্যা হয়েছে');
      if (!orderData || !orderData.id) throw new Error('অর্ডার তৈরি করা হয়েছে কিন্তু ID পাওয়া যায়নি');

      const orderId = orderData.id;

      const orderItems = items
        .filter(item => existingProducts?.some(p => p.id === item.id))
        .map((item) => ({
          order_id: orderId,
          product_id: item.id,
          quantity: item.quantity,
          price: parseFloat(item.price.toFixed(2)),
        }));

      if (orderItems.length === 0) {
        await supabase.from('orders').delete().eq('id', orderId);
        throw new Error('কোন বৈধ পণ্য পাওয়া যায়নি');
      }

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', orderId);
        throw new Error(itemsError.message || 'অর্ডার আইটেম যোগ করতে সমস্যা হয়েছে');
      }

      setOrderId(orderId);
      setOrderConfirmed(true);
      clearCart();
      toast.success('অর্ডার সফলভাবে প্লেস করা হয়েছে!');
    } catch (error: any) {
      console.error('Order error details:', error);
      toast.error(error?.message || 'অর্ডারে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">আপনার কার্ট খালি</h2>
            <Button onClick={() => navigate('/')}>কেনাকাটা শুরু করুন</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col page-transition">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-4 sm:py-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8">আপনার কার্ট</h1>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-8">
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            {items.map((item) => {
              // Use improved getFirstImageUrl to strictly filter valid images (not video/invalid)
              const firstImageUrl = getFirstImageUrl(item.image_url);
              return (
                <Card key={item.id} className="card-hover animate-fade-in">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      {firstImageUrl ? (
                        <img
                          src={firstImageUrl}
                          alt={item.name}
                          className="w-full sm:w-20 h-32 sm:h-20 object-cover rounded transition-transform duration-200 hover:scale-105"
                        />
                      ) : (
                        <div className="w-full sm:w-20 h-32 sm:h-20 bg-muted rounded flex items-center justify-center">
                          <span className="text-2xl">📦</span>
                        </div>
                      )}

                      <div className="flex-1">
                        <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">{item.name}</h3>
                        <p className="text-base sm:text-lg font-bold text-primary">৳{item.price.toFixed(2)}</p>
                        
                        <div className="flex items-center gap-2 mt-2 sm:mt-3">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 sm:h-8 sm:w-8 transition-all duration-200 hover:scale-110"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <span className="w-10 sm:w-12 text-center font-semibold text-sm sm:text-base">{item.quantity}</span>
                          <Button
  size="icon"
  variant="outline"
  className="h-7 w-7 sm:h-8 sm:w-8 transition-all duration-200 hover:scale-110"
  onClick={() => {
    fbqTrack("AddToCart", {
      content_ids: [item.id],
      content_type: "product",
      value: item.price,
      currency: "BDT",
    });
    updateQuantity(item.id, item.quantity + 1);
  }}
>
  <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
</Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-7 w-7 sm:h-8 sm:w-8 ml-auto transition-all duration-200 hover:scale-110"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-4 lg:h-fit">
            <Card className="card-hover animate-fade-in">
              <CardContent className="p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold mb-4">অর্ডার সম্পন্ন করুন</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">নাম *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">ফোন নম্বর *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="address">সম্পূর্ণ ঠিকানা *</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label>লোকেশন *</Label>
                    <RadioGroup
                      value={formData.location}
                      onValueChange={(value) =>
                        setFormData({ ...formData, location: value as any })
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="inside_dhaka" id="inside" />
                        <Label htmlFor="inside" className="font-normal">ঢাকার ভিতরে</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="outside_dhaka" id="outside" />
                        <Label htmlFor="outside" className="font-normal">ঢাকার বাইরে</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span>পণ্যের মূল্য:</span>
                      <span className="font-semibold">৳{totalPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ডেলিভারি চার্জ:</span>
                      <span className="font-semibold">৳{deliveryCharge.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>সর্বমোট:</span>
                      <span className="text-primary">৳{finalTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button type="submit" className="w-full btn-order transition-all duration-300" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        অপেক্ষা করুন...
                      </>
                    ) : (
                      'অর্ডার প্লেস করুন'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />

      <Dialog open={orderConfirmed} onOpenChange={setOrderConfirmed}>
        <DialogContent className="sm:max-w-md animate-fade-in">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900 p-3 animate-fade-in">
                <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl sm:text-2xl">অর্ডার প্লেস হয়েছে!</DialogTitle>
            <DialogDescription className="text-center mt-2 text-sm sm:text-base">
              আপনার অর্ডার সফলভাবে প্লেস করা হয়েছে। অ্যাডমিন শীঘ্রই আপনার অর্ডার নিশ্চিত করবে এবং আপনার সাথে যোগাযোগ করবে।
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-muted p-3 sm:p-4 rounded-lg transition-colors">
              <p className="text-xs sm:text-sm text-muted-foreground">অর্ডার আইডি:</p>
              <p className="font-mono text-xs sm:text-sm font-semibold break-all">{orderId}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1 transition-all duration-300 hover:scale-105"
                onClick={() => {
                  setOrderConfirmed(false);
                  navigate('/');
                }}
              >
                হোমপেজে যান
              </Button>
              <Button
                variant="outline"
                className="flex-1 transition-all duration-300 hover:scale-105"
                onClick={() => {
                  setOrderConfirmed(false);
                  setFormData({
                    name: '',
                    phone: '',
                    address: '',
                    location: 'inside_dhaka',
                  });
                }}
              >
                বন্ধ করুন
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cart;