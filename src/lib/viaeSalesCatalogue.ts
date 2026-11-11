import {supabase} from './supabase';
import type {Category,Product} from '../types';

export const VIAE_SHOP_ID='3fe4c82d-a659-406b-b290-32d8a49f2bdf';
const standaloneGeneratorCodes=new Set(['C104','C105']);

export async function loadViaeSalesCatalogue():Promise<{products:Product[];categories:Category[]}>{
 const {data,error}=await supabase.from('viae_design_catalogue').select('id,catalogue_code,title,display_title,category,preview_url,internal_only,reference_price_php,digital_enabled,printed_enabled,digital_price_php,printed_price_php').eq('business_id',VIAE_SHOP_ID).eq('source_present',true).neq('website_status','archived').order('title');
 if(error)throw error;
 const categories=[...new Set((data??[]).map(d=>d.internal_only?'Custom Orders':d.category))].map(name=>({id:name,name}));
 const products=(data??[]).map(d=>{
  const isStandaloneGenerator=d.category==='Generator'&&standaloneGeneratorCodes.has(d.catalogue_code)&&Number(d.reference_price_php)>0;
  const variants=d.internal_only
   ?[{id:'custom_digital',name:'Custom Digital File',price_override:Number(d.reference_price_php||0),quantity_on_hand:100000,active:true},{id:'custom',name:'Custom Printed Item',price_override:Number(d.reference_price_php||0),quantity_on_hand:100000,active:true}]
   :isStandaloneGenerator
    ?[{id:'generator',name:'Digital File',price_override:Number(d.reference_price_php),quantity_on_hand:100000,active:true}]
    :[...(d.digital_enabled?[{id:'digital',name:'Digital File',price_override:Number(d.digital_price_php||0),quantity_on_hand:100000,active:true}]:[]),...(d.printed_enabled&&d.category!=='Generator'?[{id:'printed',name:'Printed by VIAE',price_override:Number(d.printed_price_php||0),quantity_on_hand:100000,active:true}]:[])];
  return {id:d.id,catalogue_code:d.catalogue_code,business_id:VIAE_SHOP_ID,name:d.display_title||d.title,regular_price:d.internal_only?Number(d.reference_price_php||0):null,sale_price:null,image_url:d.preview_url,variant_label:isStandaloneGenerator?'Delivery':'Format',letters_required:0,alphabet_style:null,variants,quantity_on_hand:100000,low_stock_threshold:0,category_id:d.internal_only?'Custom Orders':d.category,active:true,needs_stock_count:false,internal_only:d.internal_only};
 }).filter(d=>d.internal_only||d.variants.length>0);
 return {categories,products};
}
