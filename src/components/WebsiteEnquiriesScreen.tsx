import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";

type Status = "new" | "in_progress" | "resolved";
type Submission = {
  id: string; form_type: "contact" | "print_service"; name: string; email: string; phone: string;
  business_name: string; subject: string; message: string; details: Record<string, unknown>;
  status: Status; internal_note: string; created_at: string;
};
const filters: Array<{ id: "all" | Status; label: string }> = [
  { id: "all", label: "All" }, { id: "new", label: "New" },
  { id: "in_progress", label: "In progress" }, { id: "resolved", label: "Resolved" },
];
const labels: Record<Status, string> = { new: "New", in_progress: "In progress", resolved: "Resolved" };
const dateLabel = (value: string) => new Date(value).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" });

export function WebsiteEnquiriesScreen({ businessId, onBack }: { businessId: string; onBack: () => void }) {
  const [rows, setRows] = useState<Submission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("viae_form_submissions")
      .select("id,form_type,name,email,phone,business_name,subject,message,details,status,internal_note,created_at")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(250);
    if (queryError) setError(queryError.message);
    else {
      setRows((data ?? []) as Submission[]);
      setSelectedId(current => current && (data ?? []).some(row => row.id === current) ? current : data?.[0]?.id ?? null);
    }
    setLoading(false);
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  const shown = rows.filter(row => filter === "all" || row.status === filter);
  const selected = rows.find(row => row.id === selectedId) ?? null;
  const update = async (changes: Partial<Pick<Submission, "status" | "internal_note">>) => {
    if (!selected) return;
    setSaving(true); setError("");
    const { error: updateError } = await supabase.from("viae_form_submissions")
      .update({ ...changes, updated_at: new Date().toISOString() }).eq("id", selected.id).eq("business_id", businessId);
    if (updateError) setError(updateError.message); else await load();
    setSaving(false);
  };
  return <ScrollView contentContainerStyle={s.page}>
    <Pressable onPress={onBack} style={s.back}><Ionicons name="arrow-back" size={18} color="#650f1c"/><Text style={s.backText}>Back to VIAE</Text></Pressable>
    <View style={s.header}><View style={s.flex}><Text style={s.kicker}>VIAE WEBSITE</Text><Text style={s.title}>Website enquiries</Text><Text style={s.help}>Shop bags, reseller package requests and custom enquiries from the VIAE website. Requests are not paid orders. Review prices and shipping before creating an order.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh enquiries" onPress={() => void load()} style={s.refresh}><Ionicons name="refresh" size={19} color="#650f1c"/></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map(item=><Pressable key={item.id} onPress={()=>setFilter(item.id)} style={[s.filter,filter===item.id&&s.filterActive]}><Text style={[s.filterText,filter===item.id&&s.filterTextActive]}>{item.label}{item.id==="new"?` · ${rows.filter(row=>row.status==="new").length}`:""}</Text></Pressable>)}</ScrollView>
    {error?<Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>:null}
    {loading?<View style={s.loading}><ActivityIndicator color="#650f1c"/><Text style={s.help}>Loading messages…</Text></View>:shown.length===0?<View style={s.empty}><Ionicons name="mail-open-outline" size={30} color="#9f7c83"/><Text style={s.emptyTitle}>No {filter==="all"?"website enquiries":labels[filter].toLowerCase()+" enquiries"} yet</Text><Text style={s.help}>New contact and print-service forms will appear here.</Text></View>:<View style={s.columns}>
      <View style={s.list}>{shown.map(row=><Pressable key={row.id} onPress={()=>setSelectedId(row.id)} style={[s.row,selectedId===row.id&&s.rowSelected]}><View style={s.rowTop}><Text style={s.rowName} numberOfLines={1}>{row.name}</Text><Text style={[s.badge,row.status==="new"?s.badgeNew:row.status==="resolved"?s.badgeResolved:s.badgeProgress]}>{labels[row.status]}</Text></View><Text style={s.rowSubject} numberOfLines={1}>{row.subject|| (row.form_type==="print_service"?"Print service request":"Website message")}</Text><Text style={s.rowMeta}>{row.form_type==="print_service"?"Print service":"Contact"} · {dateLabel(row.created_at)}</Text></Pressable>)}</View>
      {selected?<View style={s.detail}><View style={s.detailTop}><View style={s.flex}><Text style={s.detailTitle}>{selected.subject|| (selected.form_type==="print_service"?"Print service request":"Website message")}</Text><Text style={s.detailDate}>{dateLabel(selected.created_at)}</Text></View><Text style={[s.badge,selected.status==="new"?s.badgeNew:selected.status==="resolved"?s.badgeResolved:s.badgeProgress]}>{labels[selected.status]}</Text></View>
        <Text style={s.sender}>{selected.name}{selected.business_name?` · ${selected.business_name}`:""}</Text>{selected.email?<Text selectable style={s.contact}>{selected.email}</Text>:null}{selected.phone?<Text selectable style={s.contact}>{selected.phone}</Text>:null}{selected.message?<Text selectable style={s.message}>{selected.message}</Text>:null}
        {Object.entries(selected.details??{}).filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=="").map(([key,value])=><View key={key} style={s.detailField}><Text style={s.detailLabel}>{key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase())}</Text><Text selectable style={s.detailValue}>{typeof value==='object'?JSON.stringify(value,null,2):String(value)}</Text></View>)}
        <Text style={s.detailLabel}>Internal note</Text><TextInput multiline value={selected.internal_note??""} onChangeText={value=>setRows(current=>current.map(row=>row.id===selected.id?{...row,internal_note:value}:row))} onBlur={()=>void update({internal_note:selected.internal_note??""})} placeholder="Add a note for the VIAE team" style={s.noteInput}/>
        <View style={s.actions}>{filters.filter(item=>item.id!=="all"&&item.id!==selected.status).map(item=><Pressable key={item.id} disabled={saving} onPress={()=>void update({status:item.id as Status})} style={[s.action,item.id==="resolved"&&s.actionPrimary]}><Text style={[s.actionText,item.id==="resolved"&&s.actionTextPrimary]}>{item.id==="in_progress"?"Mark in progress":item.id==="resolved"?"Mark resolved":"Reopen"}</Text></Pressable>)}</View>
      </View>:null}
    </View>}
  </ScrollView>;
}
const s=StyleSheet.create({page:{width:"100%",maxWidth:1120,alignSelf:"center",padding:18,paddingBottom:80,gap:16},back:{flexDirection:"row",alignItems:"center",gap:7,paddingVertical:7},backText:{fontSize:15,fontWeight:"600",color:"#650f1c"},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12,paddingBottom:14,borderBottomWidth:1,borderColor:"#eadde0"},kicker:{fontSize:11,fontWeight:"700",letterSpacing:1.2,color:"#8c6069"},title:{fontSize:28,fontWeight:"700",color:"#27171b",marginTop:3},help:{fontSize:14,lineHeight:20,color:"#71646a",marginTop:4},refresh:{width:42,height:42,borderRadius:10,backgroundColor:"#f8eff1",alignItems:"center",justifyContent:"center"},filters:{gap:8,paddingVertical:3},filter:{paddingHorizontal:14,paddingVertical:9,borderRadius:10,borderWidth:1,borderColor:"#e8d9dd",backgroundColor:"white"},filterActive:{backgroundColor:"#650f1c",borderColor:"#650f1c"},filterText:{fontSize:13,fontWeight:"600",color:"#5f5257"},filterTextActive:{color:"white"},error:{padding:12,color:"#7b1726",backgroundColor:"#fbeaec",borderRadius:8},loading:{padding:40,alignItems:"center",gap:10},empty:{padding:36,alignItems:"center",gap:8,borderWidth:1,borderColor:"#eadde0",borderRadius:12,backgroundColor:"#fffdfd"},emptyTitle:{fontSize:18,fontWeight:"700",color:"#2d1b20"},columns:{flexDirection:"row",flexWrap:"wrap",alignItems:"flex-start",gap:14},list:{flexGrow:1,flexBasis:320,minWidth:280,borderWidth:1,borderColor:"#eadde0",borderRadius:12,overflow:"hidden",backgroundColor:"white"},row:{padding:14,borderBottomWidth:1,borderColor:"#f0e8ea",gap:4},rowSelected:{backgroundColor:"#fcf5f6",borderLeftWidth:3,borderLeftColor:"#650f1c"},rowTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},rowName:{fontSize:15,fontWeight:"700",color:"#27171b",flex:1},rowSubject:{fontSize:14,color:"#45393d"},rowMeta:{fontSize:12,color:"#82757a"},badge:{overflow:"hidden",fontSize:11,fontWeight:"700",paddingHorizontal:8,paddingVertical:4,borderRadius:20},badgeNew:{color:"#7b1726",backgroundColor:"#f8e7eb"},badgeProgress:{color:"#765116",backgroundColor:"#f8f0df"},badgeResolved:{color:"#28604d",backgroundColor:"#e9f4ed"},detail:{flexGrow:2,flexBasis:420,minWidth:300,padding:18,gap:12,borderWidth:1,borderColor:"#eadde0",borderRadius:12,backgroundColor:"white"},detailTop:{flexDirection:"row",alignItems:"flex-start",gap:10},flex:{flex:1},detailTitle:{fontSize:21,fontWeight:"700",color:"#27171b"},detailDate:{fontSize:12,color:"#82757a",marginTop:3},sender:{fontSize:15,fontWeight:"700",color:"#302126"},contact:{fontSize:14,color:"#650f1c"},message:{fontSize:15,lineHeight:23,color:"#41353a",marginTop:4},detailField:{paddingTop:9,borderTopWidth:1,borderColor:"#f0e8ea"},detailLabel:{fontSize:12,fontWeight:"700",letterSpacing:.4,color:"#817277",textTransform:"uppercase"},detailValue:{fontSize:14,lineHeight:20,color:"#3d3035",marginTop:4},noteInput:{borderWidth:1,borderColor:"#e1d4d8",borderRadius:9,padding:11,minHeight:76,fontSize:15,textAlignVertical:"top"},actions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:4},action:{paddingHorizontal:13,paddingVertical:10,borderWidth:1,borderColor:"#dccbd0",borderRadius:9},actionPrimary:{backgroundColor:"#650f1c",borderColor:"#650f1c"},actionText:{fontSize:13,fontWeight:"700",color:"#650f1c"},actionTextPrimary:{color:"white"}});
