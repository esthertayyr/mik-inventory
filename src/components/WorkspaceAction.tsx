import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppTypography";

export function WorkspaceAction({title,help,icon,color,onPress}:{title:string;help:string;icon:keyof typeof Ionicons.glyphMap;color:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${help}`} onPress={onPress}
    style={({pressed})=>({minHeight:76,paddingHorizontal:14,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:pressed?color:`${color}28`,borderRadius:12,backgroundColor:pressed?`${color}18`:`${color}0B`})}>
    <View style={{width:38,height:38,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:color}}><Ionicons name={icon} size={20} color="#FFFFFF"/></View>
    <View style={{flex:1,minWidth:0}}><Text style={{fontSize:16,lineHeight:21,fontWeight:"700",color:"#182530"}}>{title}</Text><Text style={{marginTop:3,fontSize:14,lineHeight:20,color:"#626A73"}}>{help}</Text></View>
    <Ionicons name="chevron-forward" size={17} color="#626A73"/>
  </Pressable>;
}
