import { useState } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppTypography';

type Product = {
  id: string;
  name: string;
  category_name?: string | null;
  selling_price_php: number | null;
  source_product_images: { image_url: string; sort_order?: number }[];
  source_product_options: { selling_price_php: number | null }[];
};

/** Shared compact catalogue for VIAE sales and customer orders. */
export function ViaeProductPicker<T extends Product>({ products, onSelect, selectedIds = [] }: {
  products: T[];
  onSelect: (product: T) => void;
  selectedIds?: string[];
}) {
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [category, setCategory] = useState('All products');
  const categories = [...new Set(products.map(p=>p.category_name?.trim() || 'Other'))].sort();
  const activeCategory = category === 'All products' || categories.includes(category) ? category : 'All products';
  const visibleProducts = products.filter(p=>activeCategory==='All products'||(p.category_name?.trim()||'Other')===activeCategory);
  const gridWidth = containerWidth || Math.max(240, width - 64);
  const columns = Math.max(2, Math.min(6, Math.floor((gridWidth + 8) / 148)));
  const cardWidth = Math.max(0, (gridWidth - 8 * (columns - 1)) / columns - 0.5);
  if (!products.length) return <Text style={s.empty}>No matching products. Try another search.</Text>;
  return <View style={{gap:10}} onLayout={event=>setContainerWidth(event.nativeEvent.layout.width)}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:7,paddingBottom:7}}>
      {['All products',...categories].map(value=><Pressable key={value} accessibilityRole="button" accessibilityLabel={`Category: ${value}`} accessibilityState={{selected:activeCategory===value}} onPress={()=>setCategory(value)} style={[s.category,activeCategory===value&&s.activeCategory]}><Text style={[s.categoryText,activeCategory===value&&{color:'#fff'}]}>{value}</Text></Pressable>)}
    </View>
    <View style={s.grid}>{visibleProducts.map(product => {
    const image = [...(product.source_product_images ?? [])].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0))[0]?.image_url;
    const prices = (product.source_product_options ?? []).map(v=>v.selling_price_php).filter((p): p is number=>p!=null && Number(p)>0).map(Number);
    const price = prices.length ? Math.min(...prices) : Number(product.selling_price_php || 0);
    const priceText = price > 0 ? `${prices.length > 1 ? 'From ' : ''}${new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(price)}` : 'Price not set';
    const selected = selectedIds.includes(product.id);
    return <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Choose ${product.name}, ${priceText}`} accessibilityState={{selected}} onPress={()=>onSelect(product)} style={[s.card,{width:cardWidth},selected&&s.selected]}>
      {image ? <Image source={{uri:image}} style={s.photo} resizeMode="contain"/> : <View style={s.placeholder}><Ionicons name="image-outline" size={26} color="#9B8790"/></View>}
      <Text numberOfLines={2} style={s.name}>{product.name}</Text>
      <Text style={s.price}>{priceText}</Text>
      {selected ? <View style={s.check}><Ionicons name="checkmark" size={13} color="#fff"/></View> : null}
    </Pressable>;
  })}</View></View>;
}
const s=StyleSheet.create({
  grid:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'stretch'},
  card:{position:'relative',borderWidth:1,borderColor:'#E5DDE0',borderRadius:10,padding:8,backgroundColor:'#fff',minWidth:0},
  selected:{borderColor:'#650F1C',backgroundColor:'#FFF5F6'},
  photo:{width:'100%',height:88,backgroundColor:'#FAF8F9',borderRadius:6},
  placeholder:{height:88,alignItems:'center',justifyContent:'center',backgroundColor:'#FAF8F9',borderRadius:6},
  name:{fontSize:13,lineHeight:17,fontWeight:'600',color:'#30262B',marginTop:6,minHeight:34},
  price:{fontSize:14,lineHeight:19,fontWeight:'700',color:'#650F1C',marginTop:4},
  check:{position:'absolute',right:5,top:5,width:19,height:19,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#650F1C'},
  empty:{fontSize:14,color:'#6C6067',paddingVertical:14},
  category:{paddingHorizontal:12,paddingVertical:9,borderRadius:8,borderWidth:1,borderColor:'#E5DDE0',backgroundColor:'#fff'},
  activeCategory:{backgroundColor:'#650F1C',borderColor:'#650F1C'},
  categoryText:{fontSize:13,fontWeight:'600',color:'#650F1C'},
});
