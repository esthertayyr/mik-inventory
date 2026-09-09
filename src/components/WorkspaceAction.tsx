import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppTypography";

export function WorkspaceAction({title,help,icon,color,onPress}:{title:string;help:string;icon:keyof typeof Ionicons.glyphMap;color:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${help}`} onPress={onPress}
    style={({pressed})=>({minHeight:68,paddingHorizontal:14,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:pressed?color:`${color}38`,borderRadius:14,backgroundColor:pressed?`${color}1F`:`${color}14`,shadowColor:"#111522",shadowOpacity:pressed?0:.025,shadowRadius:6,shadowOffset:{width:0,height:2}})}>
    <View style={{width:38,height:38,borderRadius:11,alignItems:"center",justifyContent:"center",backgroundColor:`${color}12`,borderWidth:1,borderColor:`${color}32`}}><Ionicons name={icon} size={20} color={color}/></View>
    <View style={{flex:1,minWidth:0}}><Text style={{fontSize:15,lineHeight:20,fontWeight:"700",color:"#111522"}}>{title}</Text><Text numberOfLines={2} style={{marginTop:2,fontSize:13,lineHeight:18,color:"#626A78"}}>{help}</Text></View>
    <Ionicons name="chevron-forward" size={17} color="#626A73"/>
  </Pressable>;
}
