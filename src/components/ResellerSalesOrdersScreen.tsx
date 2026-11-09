import { Pressable, View } from 'react-native';
import { Text } from './AppTypography';
import { ResellerPreordersScreen } from './ResellerPreordersScreen';
import { ResellerTradeScreen } from './ResellerTradeScreen';
import { useState } from 'react';
import { OrdersScreen } from './OrdersScreen';
import {ViaeDesignOrdersScreen} from './ViaeDesignOrdersScreen';
import {VIAE_BUSINESS_ID} from './ViaeTasksScreen';

export function ResellerSalesOrdersScreen({ businessId, locationId, permissions, onBack, onPrinting }: {
  businessId: string; locationId: string; permissions?: string[]; onBack: () => void; onPrinting: (orderId?:string) => void;
}) {
  const [view, setView] = useState<'sales'|'orders'>('sales');
  const canOrder = permissions === undefined || permissions.includes('orders');
  const canSell = permissions === undefined || permissions.includes('sell');
  if(businessId===VIAE_BUSINESS_ID)return <ViaeDesignOrdersScreen businessId={businessId} locationId={locationId} onBack={onBack} canManage={canOrder}/>;
  if (!canOrder && !canSell) return <Text>No sales or order access.</Text>;
  if (!canOrder) return <ResellerTradeScreen businessId={businessId} locationId={locationId} kind="sale" onBack={onBack}/>;
  return <View style={{ flex: 1 }}>
    <View style={{ padding: 16, gap: 10, backgroundColor: '#fff' }}>
      <View style={{flexDirection:'row',gap:12}}>{(['sales','orders'] as const).map(key=><Pressable key={key} accessibilityRole="button" accessibilityState={{selected:view===key}} onPress={()=>setView(key)} style={{padding:12,backgroundColor:view===key?'#650f1c':'#f8eeee',borderRadius:8}}><Text style={{color:view===key?'#fff':'#650f1c'}}>{key==='sales'?'Product sales':'Orders'}</Text></Pressable>)}</View>
      {view==='orders'?<Text>Print and other customer orders. Track payment and completion here. No automatic stock addition.</Text>:null}
    </View>
    {view==='orders'?<OrdersScreen businessId={businessId} locationId={locationId}/>:<ResellerPreordersScreen businessId={businessId} locationId={locationId} onBack={onBack}/>}
  </View>;
}
