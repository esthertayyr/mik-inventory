import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";

type SourceItem = {
  id: string;
  name: string;
  product_url: string | null;
  platform: string;
  final_cost_sgd: number;
  order_quantity: number;
  selling_price_php: number | null;
  category_name: string;
  idea_stage: string;
  created_at: string;
  source_product_images: { image_url: string }[] | null;
};
type OptionRow = {
  id: string;
  type: string;
  value: string;
  price: string;
  moq: string;
};
type LocalImage = {
  uri: string;
  width: number;
  height: number;
  type: "product" | "screenshot";
};
const optionTypes = ["Colour", "Size", "Type", "Quantity", "Other"];
const sourcingCategories = [
  "3D products",
  "Filament",
  "Clicker parts",
  "Squishies",
  "Keychains",
  "Packaging",
  "Other",
];
const stages = [
  { id: "idea", label: "Idea" },
  { id: "researching", label: "Researching" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "ready_to_order", label: "Ready to order" },
  { id: "ordered", label: "Ordered" },
] as const;
const stageLabel = (id: string) =>
  stages.find((stage) => stage.id === id)?.label ?? "Idea";
const n = (value: string) => Math.max(0, Number(value) || 0);
const money = (value: number, currency: "SGD" | "PHP") =>
  new Intl.NumberFormat(currency === "SGD" ? "en-SG" : "en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "SGD" ? 2 : 0,
  }).format(value);

export function SourcingScreen({
  businessId,
  locationId,
  onBack,
}: {
  businessId: string;
  locationId: string;
  onBack: () => void;
}) {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [customCategory, setCustomCategory] = useState("");
  const [ideaStage, setIdeaStage] = useState("idea");
  const [link, setLink] = useState("");
  const [platform, setPlatform] = useState("Pinduoduo");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [englishDescription, setEnglishDescription] = useState("");
  const [unitSgd, setUnitSgd] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("45");
  const [marketPrice, setMarketPrice] = useState("");
  const [marketLink, setMarketLink] = useState("");
  const [sellingPhp, setSellingPhp] = useState("");
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [images, setImages] = useState<LocalImage[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("source_products")
      .select(
        "id,name,product_url,platform,final_cost_sgd,order_quantity,selling_price_php,category_name,idea_stage,created_at,source_product_images(image_url)",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) Alert.alert("Products not loaded", error.message);
    setItems((data ?? []) as SourceItem[]);
    setLoading(false);
  }, [businessId]);
  useEffect(() => {
    void load();
  }, [load]);
  const quantity = Math.max(1, Math.floor(n(qty) || 1));
  const totalSgd = n(unitSgd);
  const unitCostSgd = totalSgd / quantity;
  const unitCostPhp = unitCostSgd * n(rate);
  const suggestedPhp = unitCostPhp * 2;
  const chosenPrice = n(sellingPhp) || suggestedPhp;
  const depositAmount = chosenPrice * 0.5;
  const expectedProfit = chosenPrice - unitCostPhp;
  const reset = () => {
    setName("");
    setCategory("Other");
    setCustomCategory("");
    setIdeaStage("idea");
    setLink("");
    setPlatform("Pinduoduo");
    setSupplier("");
    setDescription("");
    setEnglishDescription("");
    setUnitSgd("");
    setQty("1");
    setRate("45");
    setMarketPrice("");
    setMarketLink("");
    setSellingPhp("");
    setOptions([]);
    setImages([]);
  };
  const addOption = () =>
    setOptions((v) => [
      ...v,
      {
        id: `${Date.now()}-${Math.random()}`,
        type: "Colour",
        value: "",
        price: "",
        moq: "1",
      },
    ]);
  const changeOption = (id: string, key: keyof OptionRow, value: string) =>
    setOptions((v) => v.map((x) => (x.id === id ? { ...x, [key]: value } : x)));
  const pickImages = async (type: LocalImage["type"]) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "Photo access needed",
        "Allow MIK to choose product images or screenshots.",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (!result.canceled)
      setImages((v) =>
        [
          ...v,
          ...result.assets.map((a) => ({
            uri: a.uri,
            width: a.width,
            height: a.height,
            type,
          })),
        ].slice(0, 12),
      );
  };
  const save = async () => {
    if (!name.trim())
      return Alert.alert("Product name needed", "Enter the product name.");
    if (n(unitSgd) > 0 && n(rate) <= 0)
      return Alert.alert(
        "Conversion rate needed",
        "Enter how many Philippine pesos equal S$1.",
      );
    if (n(unitSgd) > 0 && n(sellingPhp) > 0 && n(sellingPhp) < suggestedPhp)
      return Alert.alert(
        "Deposit will not cover the cost",
        `At ${money(n(sellingPhp), "PHP")}, the 50% deposit is only ${money(n(sellingPhp) * 0.5, "PHP")}. Set at least ${money(suggestedPhp, "PHP")} or change the payment plan.`,
      );
    if (options.some((x) => !x.value.trim()))
      return Alert.alert(
        "Complete the options",
        "Enter a name for every colour, size or type, or remove the empty row.",
      );
    setSaving(true);
    const finalPrice = n(unitSgd) > 0 ? n(sellingPhp) || suggestedPhp : null;
    const { data, error } = await supabase
      .from("source_products")
      .insert({
        business_id: businessId,
        location_id: locationId,
        name: name.trim(),
        product_url: link.trim() || null,
        category_name:
          category === "Other" && customCategory.trim()
            ? customCategory.trim()
            : category,
        idea_stage: ideaStage,
        platform,
        supplier_name: supplier.trim() || null,
        original_description: description.trim() || null,
        english_description: englishDescription.trim() || null,
        final_cost_sgd: n(unitSgd),
        exchange_rate_sgd_php: n(rate),
        order_quantity: quantity,
        deposit_percent: 50,
        market_reference_price_php: marketPrice ? n(marketPrice) : null,
        market_reference_url: marketLink.trim() || null,
        selling_price_php: finalPrice,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      return Alert.alert("Product not saved", error.message);
    }
    const productId = data.id as string;
    if (options.length) {
      const { error: optionError } = await supabase
        .from("source_product_options")
        .insert(
          options.map((x, index) => ({
            source_product_id: productId,
            option_type: x.type,
            option_value: x.value.trim(),
            price_sgd: x.price ? n(x.price) : null,
            minimum_quantity: Math.max(1, Math.floor(n(x.moq) || 1)),
            sort_order: index,
          })),
        );
      if (optionError) {
        setSaving(false);
        return Alert.alert("Options not saved", optionError.message);
      }
    }
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const resized = await ImageManipulator.manipulateAsync(
          image.uri,
          [
            image.width >= image.height
              ? { resize: { width: 1400 } }
              : { resize: { height: 1400 } },
          ],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
        );
        const response = await fetch(resized.uri);
        const path = `${businessId}/sourcing/${productId}/${Date.now()}-${i}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(path, await response.arrayBuffer(), {
            contentType: "image/jpeg",
          });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        const imageUrl = supabase.storage
          .from("product-images")
          .getPublicUrl(path).data.publicUrl;
        const { error: imageError } = await supabase
          .from("source_product_images")
          .insert({
            source_product_id: productId,
            image_url: imageUrl,
            storage_path: path,
            image_type: image.type,
            sort_order: i,
          });
        if (imageError) throw imageError;
      }
    } catch (imageError: any) {
      setSaving(false);
      return Alert.alert(
        "Product saved, but some images failed",
        imageError?.message ?? "You can add them again later.",
      );
    }
    setSaving(false);
    reset();
    setEditing(false);
    await load();
    Alert.alert(
      ideaStage === "idea" ? "Idea saved" : "Sourcing item saved",
      "The idea, category, supplier details, costs and images are now kept together.",
    );
  };
  const shownItems =
    stageFilter === "all"
      ? items
      : items.filter((item) => item.idea_stage === stageFilter);
  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#315FBE" />
        <Text style={styles.help}>Opening sourced products…</Text>
      </View>
    );
  if (!editing)
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header title="Product ideas" onBack={onBack} />
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="bag-handle-outline" size={25} color="#315FBE" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>Ideas and products to resell</Text>
            <Text style={styles.help}>
              Save an idea first. Add links, choices, costs and images when you
              find them.
            </Text>
          </View>
        </View>
        <Pressable style={styles.primary} onPress={() => setEditing(true)}>
          <Ionicons name="add" size={22} color="white" />
          <Text style={styles.primaryText}>Add product idea</Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Chip
            label={`All ${items.length}`}
            active={stageFilter === "all"}
            onPress={() => setStageFilter("all")}
          />
          {stages.map((stage) => (
            <Chip
              key={stage.id}
              label={`${stage.label} ${items.filter((item) => item.idea_stage === stage.id).length}`}
              active={stageFilter === stage.id}
              onPress={() => setStageFilter(stage.id)}
            />
          ))}
        </ScrollView>
        {shownItems.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.cardTitle}>
              {items.length ? "Nothing in this stage" : "No product ideas yet"}
            </Text>
            <Text style={styles.help}>
              Add the first item you may buy and resell.
            </Text>
          </View>
        ) : (
          shownItems.map((item) => (
            <View key={item.id} style={styles.item}>
              {item.source_product_images?.[0]?.image_url ? (
                <Image
                  source={{ uri: item.source_product_images[0].image_url }}
                  style={styles.thumb as any}
                />
              ) : (
                <View style={styles.thumbEmpty}>
                  <Ionicons name="image-outline" size={24} color="#737B89" />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.categoryTag}>{item.category_name}</Text>
                  <Text style={styles.stageTag}>
                    {stageLabel(item.idea_stage)}
                  </Text>
                </View>
                <Text style={styles.help}>
                  {item.product_url ? `${item.platform} · ` : ""}
                  {item.final_cost_sgd > 0
                    ? `${item.order_quantity} item${item.order_quantity === 1 ? "" : "s"}`
                    : "Details can be added later"}
                </Text>
                <Text style={styles.price}>
                  {item.selling_price_php
                    ? `${money(Number(item.selling_price_php), "PHP")} selling price`
                    : money(Number(item.final_cost_sgd), "SGD")}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Header
        title="Add product idea"
        onBack={() => {
          reset();
          setEditing(false);
        }}
      />
      <Section number="1" title="Product">
        <Field
          label="Product name · Required"
          value={name}
          setValue={setName}
          placeholder="Example: Mini animal keychain"
        />
        <Text style={styles.label}>What stage is it at?</Text>
        <View style={styles.chips}>
          {stages.map((stage) => (
            <Chip
              key={stage.id}
              label={stage.label}
              active={ideaStage === stage.id}
              onPress={() => setIdeaStage(stage.id)}
            />
          ))}
        </View>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {sourcingCategories.map((value) => (
            <Chip
              key={value}
              label={value}
              active={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </View>
        {category === "Other" ? (
          <Field
            label="Category name · Optional"
            value={customCategory}
            setValue={setCustomCategory}
            placeholder="Create your own category"
          />
        ) : null}
        <Field
          label="Product link · Optional"
          value={link}
          setValue={setLink}
          placeholder="Paste it now or add it later"
        />
        <Text style={styles.label}>Where is it from?</Text>
        <View style={styles.chips}>
          {["Pinduoduo", "Taobao", "Other"].map((x) => (
            <Chip
              key={x}
              label={x}
              active={platform === x}
              onPress={() => setPlatform(x)}
            />
          ))}
        </View>
        <Field
          label="Supplier or shop name · Optional"
          value={supplier}
          setValue={setSupplier}
          placeholder="Shop or seller name"
        />
        <Field
          label="Chinese details · Optional"
          value={description}
          setValue={setDescription}
          placeholder="Paste the original description"
          multiline
        />
        <Field
          label="English details · Optional"
          value={englishDescription}
          setValue={setEnglishDescription}
          placeholder="Add the translated description"
          multiline
        />
      </Section>
      <Section number="2" title="Options">
        <Text style={styles.help}>
          Add every choice the customer can select, such as colours, sizes,
          types or pack quantities.
        </Text>
        {options.map((row) => (
          <View key={row.id} style={styles.optionCard}>
            <View style={styles.chips}>
              {optionTypes.map((x) => (
                <Chip
                  key={x}
                  label={x}
                  active={row.type === x}
                  onPress={() => changeOption(row.id, "type", x)}
                />
              ))}
            </View>
            <Field
              label={`${row.type} name · Required`}
              value={row.value}
              setValue={(v) => changeOption(row.id, "value", v)}
              placeholder={`Example ${row.type.toLowerCase()}`}
            />
            <View style={styles.two}>
              <View style={styles.flex}>
                <Field
                  label="Price SGD · Optional"
                  value={row.price}
                  setValue={(v) => changeOption(row.id, "price", v)}
                  keyboardType="decimal-pad"
                  placeholder="If different"
                />
              </View>
              <View style={styles.flex}>
                <Field
                  label="Minimum quantity"
                  value={row.moq}
                  setValue={(v) => changeOption(row.id, "moq", v)}
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </View>
            </View>
            <Pressable
              style={styles.remove}
              onPress={() =>
                setOptions((v) => v.filter((x) => x.id !== row.id))
              }
            >
              <Ionicons name="trash-outline" size={17} color="#8A2943" />
              <Text style={styles.removeText}>Remove option</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.secondary} onPress={addOption}>
          <Ionicons name="add" size={20} color="#315FBE" />
          <Text style={styles.secondaryText}>Add colour, size or type</Text>
        </Pressable>
      </Section>
      <Section number="3" title="Cost and selling price">
        <Text style={styles.help}>
          Optional while this is only an idea. Enter the final SGD amount once
          the supplier shows the full item, tax and shipping total.
        </Text>
        <View style={styles.two}>
          <View style={styles.flex}>
            <Field
              label="Final amount to pay · SGD"
              value={unitSgd}
              setValue={setUnitSgd}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
          <View style={styles.flex}>
            <Field
              label="Total items in this order"
              value={qty}
              setValue={setQty}
              keyboardType="number-pad"
              placeholder="1"
            />
          </View>
        </View>
        <Field
          label="S$1 equals PHP"
          value={rate}
          setValue={setRate}
          keyboardType="decimal-pad"
          placeholder="45"
        />
        <View style={styles.summary}>
          <Summary
            label="Final cost per item"
            value={`${money(unitCostSgd, "SGD")} · ${money(unitCostPhp, "PHP")}`}
          />
          <Summary
            label="Minimum price for 50% deposit"
            value={money(suggestedPhp, "PHP")}
            strong
          />
          <Summary
            label="Customer pays now (50%)"
            value={money(depositAmount, "PHP")}
          />
          <Summary
            label="Estimated gross profit per item"
            value={money(expectedProfit, "PHP")}
          />
        </View>
        <Text style={styles.note}>
          The minimum price is twice your cost. This makes the customer's 50%
          deposit enough to cover the item cost. Local delivery remains
          separate.
        </Text>
        <Field
          label="Philippine market price · Optional"
          value={marketPrice}
          setValue={setMarketPrice}
          keyboardType="decimal-pad"
          placeholder="Price seen on Shopee or another shop"
        />
        <Field
          label="Market listing link · Optional"
          value={marketLink}
          setValue={setMarketLink}
          placeholder="Paste the Shopee or other shop link"
        />
        <Field
          label="Your final selling price · PHP"
          value={sellingPhp}
          setValue={setSellingPhp}
          keyboardType="decimal-pad"
          placeholder={`${Math.ceil(suggestedPhp || 0)}`}
        />
      </Section>
      <Section number="4" title="Images and screenshots">
        <Text style={styles.help}>
          Upload clear product pictures and screenshots of the listing. MIK
          compresses them before saving.
        </Text>
        <View style={styles.imageButtons}>
          <Pressable
            style={styles.secondary}
            onPress={() => void pickImages("product")}
          >
            <Ionicons name="images-outline" size={20} color="#315FBE" />
            <Text style={styles.secondaryText}>Add product images</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => void pickImages("screenshot")}
          >
            <Ionicons name="phone-portrait-outline" size={20} color="#315FBE" />
            <Text style={styles.secondaryText}>Add screenshots</Text>
          </Pressable>
        </View>
        <View style={styles.imageGrid}>
          {images.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={styles.imageWrap}>
              <Image
                source={{ uri: image.uri }}
                style={styles.preview as any}
                resizeMode="contain"
              />
              <Pressable
                style={styles.imageRemove}
                onPress={() =>
                  setImages((v) => v.filter((_, i) => i !== index))
                }
              >
                <Ionicons name="close" size={16} color="white" />
              </Pressable>
              <Text style={styles.imageType}>{image.type}</Text>
            </View>
          ))}
        </View>
      </Section>
      <Pressable
        style={[styles.primary, saving && styles.disabled]}
        disabled={saving}
        onPress={() => void save()}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Ionicons name="checkmark" size={22} color="white" />
        )}
        <Text style={styles.primaryText}>
          {saving
            ? "Saving…"
            : ideaStage === "idea"
              ? "Save idea"
              : "Save sourcing item"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color="#151924" />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}
function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.number}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
function Field({
  label,
  value,
  setValue,
  placeholder,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
      />
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Summary({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.help}>{label}</Text>
      <Text style={strong ? styles.summaryStrong : styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 18,
    paddingBottom: 80,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    gap: 16,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  back: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  headerTitle: { fontSize: 21, fontWeight: "700", color: "#151924" },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "#D5E0F4",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  title: { fontSize: 23, fontWeight: "700", color: "#151924", marginBottom: 3 },
  help: { fontSize: 14, lineHeight: 20, color: "#626A78" },
  primary: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#315FBE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { fontSize: 16, fontWeight: "700", color: "white" },
  disabled: { opacity: 0.55 },
  empty: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    alignItems: "center",
    gap: 5,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    backgroundColor: "white",
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#F4F5F7",
  },
  thumbEmpty: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#F4F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#151924" },
  price: { fontSize: 15, fontWeight: "700", color: "#315FBE", marginTop: 5 },
  section: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    backgroundColor: "white",
    gap: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 1,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 14, fontWeight: "800", color: "#315FBE" },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: "#151924" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#313744" },
  input: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 16,
    color: "#151924",
    backgroundColor: "#FBFCFD",
  },
  textarea: { minHeight: 92, paddingTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterRow: { gap: 8, paddingVertical: 2, paddingRight: 18 },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 5,
    marginBottom: 3,
  },
  categoryTag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#315FBE",
    backgroundColor: "#EEF3FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stageTag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#594C8D",
    backgroundColor: "#F3F1F8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    backgroundColor: "white",
  },
  chipOn: { backgroundColor: "#315FBE", borderColor: "#315FBE" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#4F5664" },
  chipTextOn: { color: "white" },
  optionCard: {
    gap: 11,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "#E6E8ED",
  },
  two: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  secondary: {
    minHeight: 45,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D6F2",
    backgroundColor: "#F5F8FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryText: { fontSize: 15, fontWeight: "700", color: "#315FBE" },
  remove: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
  },
  removeText: { fontSize: 14, fontWeight: "600", color: "#8A2943" },
  summary: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F2F5FA",
    gap: 9,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#151924",
    textAlign: "right",
  },
  summaryStrong: {
    fontSize: 20,
    fontWeight: "800",
    color: "#315FBE",
    textAlign: "right",
  },
  note: { fontSize: 13, lineHeight: 18, color: "#626A78" },
  imageButtons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageWrap: { width: 112 },
  preview: {
    width: 112,
    height: 112,
    borderRadius: 13,
    backgroundColor: "#F4F5F7",
    borderWidth: 1,
    borderColor: "#E1E4EA",
  },
  imageRemove: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#8A2943",
    alignItems: "center",
    justifyContent: "center",
  },
  imageType: {
    fontSize: 12,
    color: "#626A78",
    textTransform: "capitalize",
    marginTop: 4,
    textAlign: "center",
  },
});
