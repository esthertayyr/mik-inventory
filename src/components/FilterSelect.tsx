import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppTypography";

/** A touch-friendly filter. Options stay in the page, never outside the viewport. */
export function FilterSelect({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false);
  return <View style={{marginVertical:12}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} style={{minHeight:52,padding:14,borderWidth:1,borderColor:"#E0E3E7",borderRadius:12,flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#FFF"}}>
      <Text style={{flex:1,fontSize:14,color:"#626A73"}}>{label}</Text>
      <Text style={{fontSize:14,fontWeight:"700",color:"#142C47"}}>{value}</Text>
      <Ionicons name={open?"chevron-up":"chevron-down"} size={18} color="#142C47"/>
    </Pressable>
    {open?<View style={{marginTop:6,borderWidth:1,borderColor:"#E0E3E7",borderRadius:12,overflow:"hidden"}}>{options.map(option=><Pressable key={option} accessibilityRole="button" accessibilityState={{selected:value===option}} onPress={()=>{onChange(option);setOpen(false);}} style={{minHeight:48,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:value===option?"#F0F3F6":"#FFF"}}><Text style={{fontSize:15,color:"#142C47"}}>{option}</Text>{value===option?<Ionicons name="checkmark" size={19} color="#142C47"/>:null}</Pressable>)}</View>:null}
  </View>;
}
