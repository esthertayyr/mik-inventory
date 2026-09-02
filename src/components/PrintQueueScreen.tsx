import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";

type Status = "to_print" | "printing" | "ready" | "done";
type Job = {
  id: string;
  title: string;
  quantity: number;
  filament_colour: string | null;
  needed_date: string | null;
  notes: string | null;
  status: Status;
  printer_id: string | null;
  external_order_id: string | null;
};
type Printer = { id: string; name: string; status: string };
const C = {
  ink: "#101318",
  muted: "#626A73",
  production: "#65243A",
  soft: "#F8F1F3",
  border: "#E8D8DE",
  white: "#FFF",
  green: "#264A3B",
};
const steps: Array<{ id: Status; label: string; help: string }> = [
  { id: "to_print", label: "To print", help: "Waiting to be made" },
  { id: "printing", label: "Printing", help: "Being printed now" },
  { id: "ready", label: "Ready", help: "Printing is finished" },
  { id: "done", label: "Done", help: "Job is complete" },
];
const nextStatus = (s: Status): Status | null =>
  s === "to_print"
    ? "printing"
    : s === "printing"
      ? "ready"
      : s === "ready"
        ? "done"
        : null;
const inputDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
};
const displayDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

export function PrintQueueScreen({
  businessId,
  locationId,
  onBack,
}: {
  businessId: string;
  locationId: string;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [colour, setColour] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [printerId, setPrinterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: j, error }, { data: p }] = await Promise.all([
      supabase
        .from("print_jobs")
        .select(
          "id,title,quantity,filament_colour,needed_date,notes,status,printer_id,external_order_id",
        )
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("printers")
        .select("id,name,status")
        .eq("business_id", businessId)
        .neq("status", "retired")
        .order("name"),
    ]);
    if (error) Alert.alert("Print Queue not loaded", error.message);
    setJobs((j ?? []) as Job[]);
    setPrinters((p ?? []) as Printer[]);
    setLoading(false);
  }, [businessId, locationId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const waiting = jobs.filter((j) => j.status === "to_print");
    if (waiting.length) {
      Alert.alert(
        "Orders ready to print",
        `${waiting.length} paid order${waiting.length === 1 ? " is" : "s are"} waiting in Print Queue.`,
      );
    }
  }, [jobs.length]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        steps.map((x) => [x.id, jobs.filter((j) => j.status === x.id).length]),
      ) as Record<Status, number>,
    [jobs],
  );
  const save = async () => {
    const q = Number(quantity);
    const neededDate = date.trim() ? inputDate(date) : null;
    if (!title.trim())
      return Alert.alert("Job name needed", "Enter what needs to be printed.");
    if (!Number.isInteger(q) || q < 1)
      return Alert.alert("Check quantity", "Enter at least 1.");
    if (date.trim() && !neededDate)
      return Alert.alert("Check date", "Use DD-MM-YYYY, for example 02-09-2026, or leave it empty.");
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("print_jobs")
      .insert({
        business_id: businessId,
        location_id: locationId,
        title: title.trim(),
        quantity: q,
        filament_colour: colour.trim() || null,
        needed_date: neededDate,
        notes: notes.trim() || null,
        printer_id: printerId,
        created_by: user!.id,
      });
    setSaving(false);
    if (error) return Alert.alert("Print job not saved", error.message);
    setCreating(false);
    setTitle("");
    setQuantity("1");
    setColour("");
    setDate("");
    setNotes("");
    setPrinterId(null);
    await load();
  };
  const move = async (job: Job) => {
    const next = nextStatus(job.status);
    if (!next) return;
    const { error } = await supabase
      .from("print_jobs")
      .update({ status: next })
      .eq("id", job.id);
    if (error) return Alert.alert("Job not updated", error.message);
    await load();
  };
  if (creating)
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Pressable style={s.back} onPress={() => setCreating(false)}>
          <Ionicons name="arrow-back" size={22} color={C.ink} />
          <Text style={s.backText}>New print job</Text>
        </Pressable>
        <Text style={s.title}>What needs to be printed?</Text>
        <View style={s.guide}>
          <View style={s.guideNumber}>
            <Text style={s.guideNumberText}>1</Text>
          </View>
          <Text style={s.guideText}>
            Enter the job. Optional details help the team choose the right
            printer and filament.
          </Text>
        </View>
        <Text style={s.label}>Job name · Required</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Example: 10 keyboard clicker bases"
        />
        <Text style={s.label}>Quantity · Required</Text>
        <TextInput
          style={s.input}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
        />
        <Text style={s.label}>Printer · Optional</Text>
        <View style={s.wrap}>
          {printers.map((p) => (
            <Pressable
              key={p.id}
              style={[s.choice, printerId === p.id && s.choiceOn]}
              onPress={() => setPrinterId(printerId === p.id ? null : p.id)}
            >
              <Text
                style={[s.choiceText, printerId === p.id && s.choiceTextOn]}
              >
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Filament colour · Optional</Text>
        <TextInput
          style={s.input}
          value={colour}
          onChangeText={setColour}
          placeholder="Example: Black PLA"
        />
        <Text style={s.label}>Needed date · Optional</Text>
        <TextInput
          style={s.input}
          value={date}
          onChangeText={setDate}
            placeholder="DD-MM-YYYY"
        />
        <Text style={s.label}>Note · Optional</Text>
        <TextInput
          style={[s.input, s.notes]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Anything the person printing needs to know"
        />
        <Pressable
          style={[s.save, saving && { opacity: 0.6 }]}
          disabled={saving}
          onPress={() => void save()}
        >
          <Text style={s.saveText}>
            {saving ? "Saving…" : "Add to Print Queue"}
          </Text>
        </Pressable>
      </ScrollView>
    );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={[s.heading, width < 520 && s.headingMobile]}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.back} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color={C.ink} />
            <Text style={s.backText}>Print Queue</Text>
          </Pressable>
          <Text style={s.help}>
            See what needs printing and move each job one step at a time.
          </Text>
        </View>
        <Pressable style={[s.add, width < 520 && s.addMobile]} onPress={() => setCreating(true)}>
          <Ionicons name="add" size={21} color={C.white} />
          <Text style={s.addText}>Add job</Text>
        </Pressable>
      </View>
      <View style={s.guide}>
        <View style={s.guideNumber}>
          <Text style={s.guideNumberText}>?</Text>
        </View>
        <Text style={s.guideText}>
          Tap the large button on a job when it moves forward. Jobs always
          follow: To print → Printing → Ready → Done.
        </Text>
      </View>
      <View style={s.summary}>
        {steps.map((x) => (
          <View key={x.id} style={s.summaryCard}>
            <Text style={s.summaryCount}>{counts[x.id]}</Text>
            <Text style={s.summaryLabel}>{x.label}</Text>
          </View>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={C.production} />
      ) : jobs.filter((j) => j.status !== "done").length ? (
        jobs
          .filter((j) => j.status !== "done")
          .map((job) => {
            const current = steps.find((x) => x.id === job.status)!;
            const next = nextStatus(job.status);
            const printer = printers.find((p) => p.id === job.printer_id);
            return (
              <View key={job.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.status}>
                    <Text style={s.statusText}>
                      {current.label.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={s.qty}>× {job.quantity}</Text>
                </View>
                <Text style={s.cardTitle}>{job.title}</Text>
                <Text style={s.meta}>
                  {[
                    printer?.name,
                    job.filament_colour,
                  job.needed_date ? `Needed ${displayDate(job.needed_date)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No extra details"}
                </Text>
                {job.notes ? <Text style={s.note}>{job.notes}</Text> : null}
                {next ? (
                  <Pressable style={s.move} onPress={() => void move(job)}>
                    <Text style={s.moveText}>
                      {next === "printing"
                        ? "Start printing"
                        : next === "ready"
                          ? "Mark as ready"
                          : "Mark as done"}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color={C.white} />
                  </Pressable>
                ) : null}
              </View>
            );
          })
      ) : (
        <View style={s.empty}>
          <Ionicons name="layers-outline" size={38} color={C.production} />
          <Text style={s.emptyTitle}>Nothing waiting to print</Text>
          <Text style={s.help}>
            Add a customer order or something the shop needs to restock.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingTop: 18, paddingBottom: 40 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingMobile: { flexDirection: "column", alignItems: "stretch" },
  back: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { color: C.ink, fontSize: 22, fontWeight: "700" },
  title: { marginTop: 10, color: C.ink, fontSize: 28, fontWeight: "700" },
  help: { marginTop: 3, color: C.muted, fontSize: 14, lineHeight: 20 },
  add: {
    minHeight: 48,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    backgroundColor: C.production,
  },
  addText: { color: C.white, fontWeight: "700" },
  addMobile: { width: "100%", justifyContent: "center" },
  guide: {
    marginTop: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  guideNumber: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.production,
  },
  guideNumberText: { color: C.white, fontWeight: "800" },
  guideText: { flex: 1, color: C.muted, fontSize: 13, lineHeight: 19 },
  summary: { marginTop: 13, flexDirection: "row", gap: 6 },
  summaryCard: {
    minWidth: 0,
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.soft,
  },
  summaryCount: { color: C.production, fontSize: 23, fontWeight: "800" },
  summaryLabel: {
    marginTop: 2,
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  card: {
    marginTop: 11,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    backgroundColor: C.white,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  status: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  statusText: {
    color: C.production,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  qty: { color: C.ink, fontWeight: "800" },
  cardTitle: { marginTop: 13, color: C.ink, fontSize: 19, fontWeight: "700" },
  meta: { marginTop: 6, color: C.muted, fontSize: 12, lineHeight: 18 },
  note: {
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#F6F7F8",
    color: C.ink,
    fontSize: 13,
  },
  move: {
    minHeight: 51,
    marginTop: 14,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 11,
    backgroundColor: C.production,
  },
  moveText: { color: C.white, fontSize: 15, fontWeight: "700" },
  empty: {
    marginTop: 18,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  emptyTitle: { marginTop: 10, color: C.ink, fontSize: 19, fontWeight: "700" },
  label: {
    marginTop: 17,
    marginBottom: 6,
    color: C.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    minHeight: 54,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.white,
    color: C.ink,
    fontSize: 16,
  },
  notes: { minHeight: 100, paddingTop: 13, textAlignVertical: "top" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    minHeight: 42,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    backgroundColor: C.white,
  },
  choiceOn: { backgroundColor: C.production, borderColor: C.production },
  choiceText: { color: C.ink, fontSize: 13, fontWeight: "700" },
  choiceTextOn: { color: C.white },
  save: {
    minHeight: 58,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: C.production,
  },
  saveText: { color: C.white, fontSize: 16, fontWeight: "700" },
});
