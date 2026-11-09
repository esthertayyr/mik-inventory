import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppTypography';
import { SaleReceipt, type ReceiptKind } from './SaleReceipt';

type Sale = {
  id:string;title:string;variant?:string|null;quantity:number;total:number;
  date:string;paymentMethod:string;image?:string|null;customer?:string|null;
  notes?:string|null;cancelled?:boolean;items?:string[];
};
export function ViaeSaleCard({sale,kind}:{sale:Sale;kind:ReceiptKind}){
  const [open,setOpen]=useState(false);
  const amount=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(sale.total);
  const date=sale.date.slice(0,10).split('-').reverse().join('-');
  const notes=sale.notes?.replace(/^Digital sale[^\n]*\n/,'');
  return <View style={s.card}>
    <View style={s.top}>
      {sale.image?<Image source={{uri:sale.image}} accessibilityLabel={sale.title} style={s.photo} resizeMode="contain"/>:<View style={[s.photo,s.placeholder]}><Ionicons name="image-outline" size={25} color="#A1949A"/></View>}
      <View style={s.main}>
        <Text style={s.title} numberOfLines={2}>{sale.title}</Text>
        {sale.variant?<Text style={s.meta} numberOfLines={1}>{sale.variant}</Text>:null}
        <Text style={s.meta}>Qty {sale.quantity} · {date}</Text>
        <Text style={s.meta}>{sale.paymentMethod || 'Payment method not recorded'}</Text>
      </View>
      <View style={s.amountColumn}><Text style={s.amount}>{amount}</Text><Text style={[s.status,sale.cancelled&&s.cancelled]}>{sale.cancelled?'Cancelled':'Completed'}</Text></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${open?'Hide':'View'} sale details for ${sale.title}`} accessibilityState={{expanded:open}} onPress={()=>setOpen(v=>!v)} style={s.detailsButton}><Text style={s.link}>{open?'Hide details':'View details'}</Text><Ionicons name={open?'chevron-up':'chevron-down'} size={16} color="#650F1C"/></Pressable>
    {open?<View style={s.details}>
      <Text style={s.meta}>Sale reference: {sale.id.slice(0,8)}</Text>
      {sale.customer?<Text style={s.detailText}>Customer: {sale.customer}</Text>:null}
      <Text style={s.detailText}>Quantity: {sale.quantity}</Text>
      <Text style={s.detailText}>Total {sale.cancelled?'recorded':'paid'}: {amount}</Text>
      <Text style={s.detailText}>Payment: {sale.paymentMethod || 'Not recorded'}</Text>
      {sale.items?.map((item,i)=><Text key={i} style={s.detailText}>{item}</Text>)}
      {notes?<Text style={s.detailText}>{notes}</Text>:null}
      <SaleReceipt kind={kind} recordId={sale.id}/>
    </View>:null}
  </View>;
}
const s=StyleSheet.create({
 card:{padding:14,borderWidth:1,borderColor:'#E6DEE1',borderRadius:12,backgroundColor:'#fff',gap:10},
 top:{flexDirection:'row',alignItems:'center',gap:12},
 photo:{width:64,height:64,borderRadius:8,backgroundColor:'#FAF7F8'},placeholder:{alignItems:'center',justifyContent:'center'},
 main:{flex:1,minWidth:0,gap:4},title:{fontSize:16,lineHeight:21,fontWeight:'700',color:'#30252B'},
 meta:{fontSize:12,lineHeight:18,color:'#71666D'},amountColumn:{alignItems:'flex-end',gap:6,flexShrink:0},
 amount:{fontSize:17,fontWeight:'700',color:'#650F1C'},status:{fontSize:11,fontWeight:'600',color:'#236346',backgroundColor:'#EAF5EE',paddingVertical:4,paddingHorizontal:7,borderRadius:6},cancelled:{color:'#70666A',backgroundColor:'#F0ECEE'},
 detailsButton:{minHeight:36,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:'#F0EAED',paddingTop:8},link:{fontSize:13,fontWeight:'600',color:'#650F1C'},
 details:{gap:7,paddingTop:6},detailText:{fontSize:14,lineHeight:20,color:'#41343D'},
});
