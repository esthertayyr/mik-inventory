import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppTypography";

export function WorkspaceAction({title,help,icon,color,onPress}:{title:string;help:string;icon:keyof typeof Ionicons.glyphMap;color:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${help}`} onPress={onPress}
    style={({pressed})=>({minHeight:76,paddingHorizontal:15,paddingVertical:12,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:pressed?color:`${color}2E`,borderRadius:16,backgroundColor:pressed?`${color}14`:"#FFFFFF",shadowColor:"#111522",shadowOpacity:pressed?0:.035,shadowRadius:8,shadowOffset:{width:0,height:3}})}>
    <View style={{width:40,height:40,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:`${color}14`,borderWidth:1,borderColor:`${color}24`}}><Ionicons name={icon} size={21} color={color}/></View>
    <View style={{flex:1,minWidth:0}}><Text style={{fontSize:16,lineHeight:21,fontWeight:"600",color:"#111522"}}>{title}</Text><Text style={{marginTop:3,fontSize:14,lineHeight:20,color:"#626A78"}}>{help}</Text></View>
    <Ionicons name="chevron-forward" size={17} color="#626A73"/>
  </Pressable>;
}
