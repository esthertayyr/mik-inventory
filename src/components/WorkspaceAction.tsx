import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppTypography";

export function WorkspaceAction({title,help,icon,color,onPress}:{title:string;help:string;icon:keyof typeof Ionicons.glyphMap;color:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${help}`} onPress={onPress}
    style={({pressed})=>({minHeight:88,padding:16,flexDirection:"row",alignItems:"center",gap:14,borderWidth:1,borderColor:pressed?color:"#E4E7EB",borderRadius:12,backgroundColor:pressed?"#F5F7F9":"#FFFFFF"})}>
    <View style={{width:38,height:38,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"#F4F6F8"}}><Ionicons name={icon} size={21} color={color}/></View>
    <View style={{flex:1,minWidth:0}}><Text style={{fontSize:16,lineHeight:21,fontWeight:"600",color:"#182530"}}>{title}</Text><Text style={{marginTop:3,fontSize:13,lineHeight:19,color:"#626A73"}}>{help}</Text></View>
    <Ionicons name="chevron-forward" size={17} color="#626A73"/>
  </Pressable>;
}
