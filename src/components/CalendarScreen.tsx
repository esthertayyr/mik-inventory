import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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

const C = {
  ink: "#111820",
  muted: "#68717B",
  green: "#244B3B",
  navy: "#142C47",
  ruby: "#733342",
  white: "#FFFFFF",
  line: "#E0E4E7",
  pale: "#F1F6F3",
  paleBlue: "#EEF2F6",
  paleRed: "#F8EFF1",
};

export type ShopEvent = {
  id: string;
  business_id: string;
  location_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  venue: string | null;
  notes: string | null;
  remind_days_before: number;
  status: "planned" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
};

type EventDraft = {
  title: string;
  event_date: string;
  start_time: string;
  venue: string;
  notes: string;
  remind_days_before: number;
};

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function readableDate(value: string, weekday = true) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseDate(value));
}

function readableTime(value: string | null) {
  if (!value) return "Time not set";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function blankDraft(eventDate = dateKey()): EventDraft {
  return { title: "", event_date: eventDate, start_time: "", venue: "", notes: "", remind_days_before: 1 };
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value;
}

function validTime(value: string) {
  return !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function CalendarScreen({ businessId, locationId, onBack }: { businessId: string; locationId: string; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [events, setEvents] = useState<ShopEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [editing, setEditing] = useState<ShopEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(blankDraft());
  const [formOpen, setFormOpen] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shop_events")
      .select("id,business_id,location_id,title,event_date,start_time,venue,notes,remind_days_before,status,created_at,updated_at")
      .eq("location_id", locationId)
      .neq("status", "cancelled")
      .order("event_date")
      .order("start_time");
    setLoading(false);
    if (error) return Alert.alert("Calendar not loaded", error.message);
    setEvents((data ?? []) as ShopEvent[]);
  }, [locationId]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const eventMap = useMemo(() => {
    const map = new Map<string, ShopEvent[]>();
    events.forEach((event) => map.set(event.event_date, [...(map.get(event.event_date) ?? []), event]));
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const selectedEvents = eventMap.get(selectedDate) ?? [];
  const upcoming = events.filter((event) => event.status === "planned" && event.event_date >= dateKey()).slice(0, 8);

  const openNew = (eventDate = selectedDate) => {
    setEditing(null);
    setDraft(blankDraft(eventDate));
    setFormOpen(true);
  };

  const openEdit = (event: ShopEvent) => {
    setEditing(event);
    setDraft({
      title: event.title,
      event_date: event.event_date,
      start_time: event.start_time?.slice(0, 5) ?? "",
      venue: event.venue ?? "",
      notes: event.notes ?? "",
      remind_days_before: event.remind_days_before,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!draft.title.trim()) return Alert.alert("Add an event name", "For example: Weekend market.");
    if (!validDate(draft.event_date)) return Alert.alert("Check the date", "Use YYYY-MM-DD, for example 2026-09-12.");
    if (!validTime(draft.start_time)) return Alert.alert("Check the time", "Use 24-hour time, for example 14:30. You can also leave it blank.");
    setSaving(true);
    const values = {
      business_id: businessId,
      location_id: locationId,
      title: draft.title.trim(),
      event_date: draft.event_date,
      start_time: draft.start_time || null,
      venue: draft.venue.trim() || null,
      notes: draft.notes.trim() || null,
      remind_days_before: draft.remind_days_before,
    };
    const { error } = editing
      ? await supabase.from("shop_events").update(values).eq("id", editing.id)
      : await supabase.from("shop_events").insert(values);
    setSaving(false);
    if (error) return Alert.alert("Event not saved", error.message);
    setSelectedDate(draft.event_date);
    const savedDate = parseDate(draft.event_date);
    setMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1));
    setFormOpen(false);
    await loadEvents();
  };

  const markDone = async (event: ShopEvent) => {
    const { error } = await supabase.from("shop_events").update({ status: event.status === "completed" ? "planned" : "completed" }).eq("id", event.id);
    if (error) return Alert.alert("Event not updated", error.message);
    await loadEvents();
  };

  const remove = async () => {
    if (!editing) return;
    const run = async () => {
      setSaving(true);
      const { error } = await supabase.from("shop_events").delete().eq("id", editing.id);
      setSaving(false);
      if (error) return Alert.alert("Event not deleted", error.message);
      setFormOpen(false);
      await loadEvents();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${editing.title}?`)) await run();
    } else {
      Alert.alert("Delete this event?", editing.title, [
        { text: "Keep", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void run() },
      ]);
    }
  };

  const moveMonth = (amount: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" style={styles.back} onPress={onBack}>
          <Ionicons name="arrow-back" size={23} color={C.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Events, dates and reminders.</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.addTop} onPress={() => openNew()}>
          <Ionicons name="add" size={22} color={C.white} />
          {width >= 520 ? <Text style={styles.addTopText}>Add event</Text> : null}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.columns, wide && styles.columnsWide]}>
          <View style={[styles.calendarCard, wide && styles.calendarWide]}>
            <View style={styles.monthRow}>
              <Pressable accessibilityLabel="Previous month" style={styles.monthButton} onPress={() => moveMonth(-1)}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
              <Text style={styles.monthTitle}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
              <Pressable accessibilityLabel="Next month" style={styles.monthButton} onPress={() => moveMonth(1)}><Ionicons name="chevron-forward" size={22} color={C.ink} /></Pressable>
            </View>
            <View style={styles.weekRow}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>)}</View>
            <View style={styles.days}>
              {calendarDays.map((day) => {
                const key = dateKey(day);
                const inMonth = day.getMonth() === month.getMonth();
                const count = eventMap.get(key)?.length ?? 0;
                const selected = key === selectedDate;
                const today = key === dateKey();
                return (
                  <Pressable
                    key={key}
                    accessibilityLabel={`${readableDate(key)}${count ? `, ${count} event${count === 1 ? "" : "s"}` : ""}`}
                    style={[styles.day, selected && styles.daySelected, today && !selected && styles.dayToday]}
                    onPress={() => setSelectedDate(key)}
                  >
                    <Text style={[styles.dayText, !inMonth && styles.dayOutside, selected && styles.dayTextSelected]}>{day.getDate()}</Text>
                    {count ? <View style={[styles.eventDot, selected && styles.eventDotSelected]} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.dayAdd} onPress={() => openNew(selectedDate)}>
              <Ionicons name="add-circle-outline" size={21} color={C.green} />
              <Text style={styles.dayAddText}>Add event on {readableDate(selectedDate, false)}</Text>
            </Pressable>
          </View>

          <View style={[styles.listColumn, wide && styles.listWide]}>
            <Text style={styles.sectionTitle}>{selectedEvents.length ? readableDate(selectedDate) : "Coming up"}</Text>
            <Text style={styles.sectionHelp}>{selectedEvents.length ? `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"} on this day` : "Your next planned events"}</Text>
            {loading ? <ActivityIndicator style={styles.loader} size="large" color={C.green} /> : (selectedEvents.length ? selectedEvents : upcoming).length ? (
              (selectedEvents.length ? selectedEvents : upcoming).map((event) => (
                <Pressable key={event.id} style={[styles.eventCard, event.status === "completed" && styles.eventDone]} onPress={() => openEdit(event)}>
                  <View style={styles.eventDateBox}>
                    <Text style={styles.eventMonth}>{parseDate(event.event_date).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</Text>
                    <Text style={styles.eventDay}>{parseDate(event.event_date).getDate()}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.eventTitle, event.status === "completed" && styles.completedText]} numberOfLines={2}>{event.title}</Text>
                    <Text style={styles.eventMeta}>{readableTime(event.start_time)}{event.venue ? ` · ${event.venue}` : ""}</Text>
                    <View style={styles.reminderTag}><Ionicons name="notifications-outline" size={13} color={C.green} /><Text style={styles.reminderText}>{event.remind_days_before === 0 ? "Remind on the day" : `${event.remind_days_before} day${event.remind_days_before === 1 ? "" : "s"} before`}</Text></View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.muted} />
                </Pressable>
              ))
            ) : (
              <View style={styles.empty}>
                <Ionicons name="calendar-clear-outline" size={35} color={C.green} />
                <Text style={styles.emptyTitle}>No events yet</Text>
                <Text style={styles.emptyText}>Add a market, delivery date or shop event.</Text>
                <Pressable style={styles.emptyButton} onPress={() => openNew(selectedDate)}><Text style={styles.emptyButtonText}>Add first event</Text></Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={formOpen} transparent animationType="fade" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.formCard}>
            <View style={styles.formHeading}>
              <View style={styles.flex}><Text style={styles.formTitle}>{editing ? "Edit event" : "Add event"}</Text><Text style={styles.formHelp}>Only the event name and date are needed.</Text></View>
              <Pressable accessibilityLabel="Close" style={styles.close} onPress={() => setFormOpen(false)}><Ionicons name="close" size={24} color={C.ink} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formScroll}>
              <Text style={styles.label}>Event name</Text>
              <TextInput style={styles.input} value={draft.title} onChangeText={(title) => setDraft((d) => ({ ...d, title }))} placeholder="Example: Weekend market" maxLength={120} />
              <Text style={styles.label}>Date</Text>
              <TextInput style={styles.input} value={draft.event_date} onChangeText={(event_date) => setDraft((d) => ({ ...d, event_date }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
              <View style={styles.dateChoices}>
                {[{ label: "Today", add: 0 }, { label: "Tomorrow", add: 1 }, { label: "Next week", add: 7 }].map((option) => (
                  <Pressable key={option.label} style={styles.dateChoice} onPress={() => { const next = new Date(); next.setDate(next.getDate() + option.add); setDraft((d) => ({ ...d, event_date: dateKey(next) })); }}><Text style={styles.dateChoiceText}>{option.label}</Text></Pressable>
                ))}
              </View>
              <Text style={styles.label}>Time <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput style={styles.input} value={draft.start_time} onChangeText={(start_time) => setDraft((d) => ({ ...d, start_time }))} placeholder="Example: 14:30" keyboardType="numbers-and-punctuation" maxLength={5} />
              <Text style={styles.label}>Place <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput style={styles.input} value={draft.venue} onChangeText={(venue) => setDraft((d) => ({ ...d, venue }))} placeholder="Example: City night market" maxLength={160} />
              <Text style={styles.label}>Remind me</Text>
              <View style={styles.reminderChoices}>
                {[0, 1, 3, 7].map((days) => (
                  <Pressable key={days} style={[styles.reminderChoice, draft.remind_days_before === days && styles.reminderChoiceOn]} onPress={() => setDraft((d) => ({ ...d, remind_days_before: days }))}>
                    <Text style={[styles.reminderChoiceText, draft.remind_days_before === days && styles.reminderChoiceTextOn]}>{days === 0 ? "On the day" : `${days} day${days === 1 ? "" : "s"} before`}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Notes <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput style={[styles.input, styles.notes]} value={draft.notes} onChangeText={(notes) => setDraft((d) => ({ ...d, notes }))} placeholder="What should the team remember?" multiline maxLength={1000} />
              <Pressable style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving}><Ionicons name="checkmark" size={22} color={C.white} /><Text style={styles.saveText}>{saving ? "Saving…" : "Save event"}</Text></Pressable>
              {editing ? (
                <>
                  <Pressable style={styles.doneButton} onPress={() => { setFormOpen(false); void markDone(editing); }}><Ionicons name={editing.status === "completed" ? "refresh-outline" : "checkmark-circle-outline"} size={21} color={C.green} /><Text style={styles.doneText}>{editing.status === "completed" ? "Mark as planned" : "Mark as done"}</Text></Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => void remove()} disabled={saving}><Ionicons name="trash-outline" size={20} color={C.ruby} /><Text style={styles.deleteText}>Delete event</Text></Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  heading: { minHeight: 82, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.white },
  title: { color: C.ink, fontSize: 27, lineHeight: 32, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { marginTop: 2, color: C.muted, fontSize: 14 },
  addTop: { minHeight: 46, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: C.green },
  addTopText: { color: C.white, fontSize: 14, fontWeight: "700" },
  scroll: { paddingBottom: 34 },
  columns: { gap: 16 },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  calendarCard: { padding: 14, borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.white },
  calendarWide: { flex: 1.35 },
  listColumn: { paddingBottom: 8 },
  listWide: { flex: 1, paddingTop: 4 },
  monthRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.paleBlue },
  monthTitle: { color: C.ink, fontSize: 18, fontWeight: "700" },
  weekRow: { marginTop: 8, flexDirection: "row" },
  weekDay: { width: "14.2857%", paddingVertical: 8, color: C.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  days: { flexDirection: "row", flexWrap: "wrap" },
  day: { width: "14.2857%", aspectRatio: 1, maxHeight: 66, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  daySelected: { backgroundColor: C.green },
  dayToday: { borderWidth: 1.5, borderColor: C.green },
  dayText: { color: C.ink, fontSize: 14, fontWeight: "600" },
  dayOutside: { color: "#B8BEC4" },
  dayTextSelected: { color: C.white, fontWeight: "700" },
  eventDot: { width: 5, height: 5, marginTop: 3, borderRadius: 3, backgroundColor: C.ruby },
  eventDotSelected: { backgroundColor: C.white },
  dayAdd: { minHeight: 48, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderTopWidth: 1, borderTopColor: C.line },
  dayAddText: { color: C.green, fontSize: 14, fontWeight: "700" },
  sectionTitle: { marginTop: 8, color: C.ink, fontSize: 22, fontWeight: "700", letterSpacing: -0.35 },
  sectionHelp: { marginTop: 3, marginBottom: 6, color: C.muted, fontSize: 13 },
  loader: { marginTop: 34 },
  eventCard: { minHeight: 90, marginTop: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: C.line, borderRadius: 15, backgroundColor: C.white },
  eventDone: { opacity: 0.62 },
  eventDateBox: { width: 50, minHeight: 58, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: C.paleBlue },
  eventMonth: { color: C.navy, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  eventDay: { marginTop: 2, color: C.navy, fontSize: 22, fontWeight: "700" },
  eventTitle: { color: C.ink, fontSize: 16, lineHeight: 20, fontWeight: "700" },
  completedText: { textDecorationLine: "line-through" },
  eventMeta: { marginTop: 4, color: C.muted, fontSize: 12, lineHeight: 17 },
  reminderTag: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  reminderText: { color: C.green, fontSize: 11, fontWeight: "700" },
  empty: { marginTop: 12, padding: 28, alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.white },
  emptyTitle: { marginTop: 10, color: C.ink, fontSize: 18, fontWeight: "700" },
  emptyText: { marginTop: 5, color: C.muted, fontSize: 13, textAlign: "center" },
  emptyButton: { minHeight: 44, marginTop: 16, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.green },
  emptyButtonText: { color: C.white, fontSize: 14, fontWeight: "700" },
  overlay: { flex: 1, padding: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,18,25,.62)" },
  formCard: { width: "100%", maxWidth: 580, maxHeight: "92%", overflow: "hidden", borderRadius: 22, backgroundColor: C.white },
  formHeading: { padding: 20, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  formTitle: { color: C.ink, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 },
  formHelp: { marginTop: 3, color: C.muted, fontSize: 13 },
  close: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.paleBlue },
  formScroll: { padding: 20, paddingBottom: 26 },
  label: { marginTop: 14, marginBottom: 7, color: C.ink, fontSize: 14, fontWeight: "700" },
  optional: { color: C.muted, fontWeight: "500" },
  input: { minHeight: 52, paddingHorizontal: 15, borderWidth: 1.5, borderColor: C.line, borderRadius: 12, color: C.ink, backgroundColor: C.white, fontSize: 16 },
  notes: { minHeight: 90, paddingTop: 13, textAlignVertical: "top" },
  dateChoices: { marginTop: 8, flexDirection: "row", gap: 7 },
  dateChoice: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.paleBlue },
  dateChoiceText: { color: C.navy, fontSize: 12, fontWeight: "700" },
  reminderChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  reminderChoice: { minHeight: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.white },
  reminderChoiceOn: { borderColor: C.green, backgroundColor: C.green },
  reminderChoiceText: { color: C.ink, fontSize: 12, fontWeight: "700" },
  reminderChoiceTextOn: { color: C.white },
  save: { minHeight: 56, marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: C.green },
  saveText: { color: C.white, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  doneButton: { minHeight: 50, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: C.green, borderRadius: 13, backgroundColor: C.white },
  doneText: { color: C.green, fontSize: 14, fontWeight: "700" },
  deleteButton: { minHeight: 48, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  deleteText: { color: C.ruby, fontSize: 14, fontWeight: "700" },
});
