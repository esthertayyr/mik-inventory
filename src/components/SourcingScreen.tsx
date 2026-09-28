import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
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
  source_currency: "RMB" | "SGD";
  source_price: number;
  tax_percent: number;
  shipping_type: "free" | "paid";
  shipping_amount: number;
  currency_to_php_rate: number;
  category_name: string;
  idea_stage: string;
  created_at: string;
  source_product_images: { image_url: string }[] | null;
};
type OptionRow = {
  id: string;
  databaseId?: string;
  value: string;
  price: string;
};
type LocalImage = {
  uri: string;
  width: number;
  height: number;
  type: "product" | "screenshot";
};
type SavedImage = { id: string; image_url: string; storage_path: string; image_type: LocalImage["type"] };
const sourcingCategories = [
  "3D products",
  "Filament",
  "Clicker parts",
  "Squishies",
  "Keychains",
  "Packaging",
  "Other",
];
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
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [customCategory, setCustomCategory] = useState("");
  const [link, setLink] = useState("");
  const [platform, setPlatform] = useState("Pinduoduo");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [englishDescription, setEnglishDescription] = useState("");
  const [currency, setCurrency] = useState<"RMB" | "SGD">("RMB");
  const [sourcePrice, setSourcePrice] = useState("");
  const [taxPercent, setTaxPercent] = useState("3");
  const [shippingType, setShippingType] = useState<"free" | "paid">("free");
  const [shippingAmount, setShippingAmount] = useState("");
  const [rate, setRate] = useState("8.1");
  const [marketPrice, setMarketPrice] = useState("");
  const [marketLink, setMarketLink] = useState("");
  const [sellingPhp, setSellingPhp] = useState("");
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("source_products")
      .select(
        "id,name,product_url,platform,final_cost_sgd,order_quantity,selling_price_php,source_currency,source_price,tax_percent,shipping_type,shipping_amount,currency_to_php_rate,category_name,idea_stage,created_at,source_product_images(image_url)",
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
  const deleteIdea = (item: SourceItem) => {
    const run = async () => {
      const { data: imageRows } = await supabase
        .from("source_product_images")
        .select("storage_path")
        .eq("source_product_id", item.id);
      const { error } = await supabase
        .from("source_products")
        .delete()
        .eq("id", item.id)
        .eq("business_id", businessId);
      if (error) {
        return Alert.alert(
          "Product idea not deleted",
          error.code === "23503"
            ? "This product is already used in a package. Remove it from the package first."
            : error.message,
        );
      }
      const paths = (imageRows ?? [])
        .map((row) => row.storage_path as string)
        .filter(Boolean);
      if (paths.length) {
        await supabase.storage.from("product-images").remove(paths);
      }
      await load();
      Alert.alert("Product idea deleted", `${item.name} has been removed.`);
    };
    const title = "Delete this product idea?";
    const message = `${item.name} and its saved variants will be removed. This cannot be undone.`;
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) void run();
      return;
    }
    Alert.alert(title, message, [
      { text: "Keep product", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };
  const listedPrice = n(sourcePrice);
  const taxAmount = listedPrice * n(taxPercent) / 100;
  const shippingCost = shippingType === "paid" ? n(shippingAmount) : 0;
  const landedSourceTotal = listedPrice + taxAmount + shippingCost;
  const landedPhpTotal = landedSourceTotal * n(rate);
  const unitCostPhp = landedPhpTotal;
  const reset = () => {
    setName("");
    setCategory("Other");
    setCustomCategory("");
    setLink("");
    setPlatform("Pinduoduo");
    setSupplier("");
    setDescription("");
    setEnglishDescription("");
    setCurrency("RMB");
    setSourcePrice("");
    setTaxPercent("3");
    setShippingType("free");
    setShippingAmount("");
    setRate("8.1");
    setMarketPrice("");
    setMarketLink("");
    setSellingPhp("");
    setOptions([]);
    setImages([]);
    setSavedImages([]);
    setEditingId(null);
  };
  const addOption = () =>
    setOptions((v) => [
      ...v,
      {
        id: `${Date.now()}-${Math.random()}`,
        value: "",
        price: "",
      },
    ]);
  const changeOption = (id: string, key: keyof OptionRow, value: string) =>
    setOptions((v) => v.map((x) => (x.id === id ? { ...x, [key]: value } : x)));
  const openItem = async (item: SourceItem) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("source_products")
      .select("*,source_product_options(id,option_value,source_price),source_product_images(id,image_url,storage_path,image_type)")
      .eq("id", item.id)
      .eq("business_id", businessId)
      .single();
    setLoading(false);
    if (error || !data) return Alert.alert("Product not opened", error?.message ?? "Please try again.");
    setEditingId(data.id);
    setName(data.name ?? "");
    const savedCategory = data.category_name ?? "Other";
    if (sourcingCategories.includes(savedCategory)) { setCategory(savedCategory); setCustomCategory(""); }
    else { setCategory("Other"); setCustomCategory(savedCategory); }
    setLink(data.product_url ?? "");
    setPlatform(data.platform ?? "Pinduoduo");
    setSupplier(data.supplier_name ?? "");
    setDescription(data.original_description ?? "");
    setEnglishDescription(data.english_description ?? "");
    setCurrency(data.source_currency === "SGD" ? "SGD" : "RMB");
    setSourcePrice(data.source_price ? String(data.source_price) : "");
    setTaxPercent(String(data.tax_percent ?? 3));
    setShippingType(data.shipping_type === "paid" ? "paid" : "free");
    setShippingAmount(data.shipping_amount ? String(data.shipping_amount) : "");
    setRate(String(data.currency_to_php_rate ?? (data.source_currency === "SGD" ? 45 : 8.1)));
    setOptions((data.source_product_options ?? []).map((option: any) => ({ id: option.id, databaseId: option.id, value: option.option_value ?? "", price: option.source_price == null ? "" : String(option.source_price) })));
    setSavedImages((data.source_product_images ?? []) as SavedImage[]);
    setImages([]);
    setEditing(true);
  };
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
  const addDroppedImages = (event: any) => {
    event?.preventDefault?.();
    const files = Array.from(event?.dataTransfer?.files ?? []) as File[];
    const next = files.filter((file) => file.type.startsWith("image/")).map((file) => ({
      uri: URL.createObjectURL(file), width: 1400, height: 1400, type: "product" as const,
    }));
    if (next.length) setImages((current) => [...current, ...next].slice(0, 12));
  };
  const save = async () => {
    const wasEditing = Boolean(editingId);
    if (!name.trim())
      return Alert.alert("Product name needed", "Enter the product name.");
    if (listedPrice > 0 && n(rate) <= 0)
      return Alert.alert(
        "Conversion rate needed",
        `Enter how many Philippine pesos equal 1 ${currency}.`,
      );
    if (options.some((x) => !x.value.trim()))
      return Alert.alert(
        "Complete the options",
        "Enter a name for every variant or choice, or remove the empty row.",
      );
    setSaving(true);
    const legacySgdCost = currency === "SGD" ? landedSourceTotal : landedPhpTotal / 45;
    const productValues = {
        business_id: businessId,
        location_id: locationId,
        name: name.trim(),
        product_url: link.trim() || null,
        category_name:
          category === "Other" && customCategory.trim()
            ? customCategory.trim()
            : category,
        idea_stage: "idea",
        platform,
        supplier_name: supplier.trim() || null,
        original_description: description.trim() || null,
        english_description: englishDescription.trim() || null,
        source_currency: currency,
        source_price: listedPrice,
        tax_percent: n(taxPercent),
        shipping_type: shippingType,
        shipping_amount: shippingCost,
        currency_to_php_rate: n(rate),
        final_cost_sgd: legacySgdCost,
        exchange_rate_sgd_php: 45,
        order_quantity: 1,
        deposit_percent: 50,
        market_reference_price_php: marketPrice ? n(marketPrice) : null,
        market_reference_url: marketLink.trim() || null,
        selling_price_php: null,
        status: "draft",
      };
    const productRequest = editingId
      ? supabase.from("source_products").update(productValues).eq("id", editingId).eq("business_id", businessId)
      : supabase.from("source_products").insert(productValues);
    const { data, error } = await productRequest.select("id").single();
    if (error) {
      setSaving(false);
      return Alert.alert("Product not saved", error.message);
    }
    const productId = data.id as string;
    if (editingId) {
      const { data: oldOptions } = await supabase.from("source_product_options").select("id").eq("source_product_id", productId);
      const keptIds = options.map((option) => option.databaseId).filter(Boolean) as string[];
      const removedIds = (oldOptions ?? []).map((option) => option.id).filter((id) => !keptIds.includes(id));
      if (removedIds.length) {
        const { error: removeError } = await supabase.from("source_product_options").delete().in("id", removedIds);
        if (removeError) { setSaving(false); return Alert.alert("Variant not removed", removeError.code === "23503" ? "This variant is already used in a package." : removeError.message); }
      }
      for (let index = 0; index < options.length; index++) {
        const option = options[index];
        const values = { option_type: "Variant", option_value: option.value.trim(), source_price: option.price ? n(option.price) : null, price_sgd: currency === "SGD" && option.price ? n(option.price) : null, minimum_quantity: 1, sort_order: index };
        const request = option.databaseId
          ? supabase.from("source_product_options").update(values).eq("id", option.databaseId).eq("source_product_id", productId)
          : supabase.from("source_product_options").insert({ source_product_id: productId, ...values });
        const { error: optionError } = await request;
        if (optionError) { setSaving(false); return Alert.alert("Variant not saved", optionError.message); }
      }
    } else if (options.length) {
      const { error: optionError } = await supabase.from("source_product_options").insert(
          options.map((x, index) => ({
            source_product_id: productId,
            option_type: "Variant",
            option_value: x.value.trim(),
            source_price: x.price ? n(x.price) : null,
            price_sgd: currency === "SGD" && x.price ? n(x.price) : null,
            minimum_quantity: 1,
            sort_order: index,
          })));
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
      wasEditing ? "Product updated" : "Idea saved",
      wasEditing ? "Your changes are saved." : "The idea, category, supplier details, costs and images are now kept together.",
    );
  };
  const itemCategories = Array.from(
    new Set(items.map((item) => item.category_name).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const shownItems = categoryFilter === "all"
    ? items
    : items.filter((item) => item.category_name === categoryFilter);
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
            active={categoryFilter === "all"}
            onPress={() => setCategoryFilter("all")}
          />
          {itemCategories.map((itemCategory) => (
            <Chip
              key={itemCategory}
              label={`${itemCategory} ${items.filter((item) => item.category_name === itemCategory).length}`}
              active={categoryFilter === itemCategory}
              onPress={() => setCategoryFilter(itemCategory)}
            />
          ))}
        </ScrollView>
        {shownItems.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.cardTitle}>
              {items.length ? "No ideas in this category" : "No product ideas yet"}
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
                </View>
                <Text style={styles.help}>
                  {item.product_url ? `${item.platform} · ` : ""}
                  {item.source_price > 0 ? "Cost saved" : "Details can be added later"}
                </Text>
                <Text style={styles.price}>
                  {item.source_currency} {Number(item.source_price || 0).toLocaleString()} · {money(((Number(item.source_price || 0) * (1 + Number(item.tax_percent || 0) / 100)) + Number(item.shipping_amount || 0)) * Number(item.currency_to_php_rate || 0), "PHP")}
                </Text>
                <View style={styles.itemActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`View or edit ${item.name}`} style={styles.editIdea} onPress={() => void openItem(item)}>
                    <Ionicons name="create-outline" size={16} color="#315FBE" />
                    <Text style={styles.editIdeaText}>View / edit</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} style={styles.deleteIdea} onPress={() => deleteIdea(item)}>
                    <Ionicons name="trash-outline" size={16} color="#8A2943" />
                    <Text style={styles.deleteIdeaText}>Delete</Text>
                  </Pressable>
                </View>
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
        title={editingId ? "View or edit product" : "Add product idea"}
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
      </Section>
      <Section number="2" title="Photos">
        <Text style={styles.help}>
          {width >= 700 ? "Drag product images here, or use the buttons below." : "Tap below to upload product images or screenshots from your phone."} MIK makes the files smaller before saving.
        </Text>
        {width >= 700 ? (
          <View
            style={styles.dropZone}
            {...({ onDragOver: (event: any) => event.preventDefault(), onDrop: addDroppedImages } as any)}
          >
            <Ionicons name="cloud-upload-outline" size={30} color="#315FBE" />
            <Text style={styles.dropTitle}>Drop images here</Text>
            <Text style={styles.help}>JPG, PNG or downloaded supplier screenshots</Text>
          </View>
        ) : null}
        <View style={styles.imageButtons}>
          <Pressable style={styles.secondary} onPress={() => void pickImages("product")}>
            <Ionicons name="images-outline" size={20} color="#315FBE" />
            <Text style={styles.secondaryText}>Add product photos</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => void pickImages("screenshot")}>
            <Ionicons name="phone-portrait-outline" size={20} color="#315FBE" />
            <Text style={styles.secondaryText}>Add screenshots</Text>
          </Pressable>
        </View>
        <View style={styles.imageGrid}>
          {savedImages.map((image) => (
            <View key={image.id} style={styles.imageWrap}>
              <Image source={{ uri: image.image_url }} style={styles.preview as any} resizeMode="contain" />
              <Text style={styles.imageType}>{image.image_type}</Text>
            </View>
          ))}
          {images.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={styles.imageWrap}>
              <Image source={{ uri: image.uri }} style={styles.preview as any} resizeMode="contain" />
              <Pressable style={styles.imageRemove} onPress={() => setImages((v) => v.filter((_, i) => i !== index))}>
                <Ionicons name="close" size={16} color="white" />
              </Pressable>
              <Text style={styles.imageType}>{image.type}</Text>
            </View>
          ))}
        </View>
      </Section>
      <Section number="3" title="Supplier and description">
        <Field label="Supplier or shop name · Optional" value={supplier} setValue={setSupplier} placeholder="Shop or seller name" />
        <Field label="Chinese details · Optional" value={description} setValue={setDescription} placeholder="Paste the original description" multiline />
        <Field label="English details · Optional" value={englishDescription} setValue={setEnglishDescription} placeholder="Add the translated description" multiline />
      </Section>
      <Section number="4" title="Variants and choices">
        <Text style={styles.help}>
          Add each choice exactly as the supplier shows it, such as Pink, Large Blue or Pack of 50. Each choice can have its own price.
        </Text>
        <Text style={styles.label}>Variant price currency</Text>
        <View style={styles.chips}>
          <Chip label="RMB" active={currency === "RMB"} onPress={() => { setCurrency("RMB"); setRate("8.1"); }} />
          <Chip label="SGD" active={currency === "SGD"} onPress={() => { setCurrency("SGD"); setRate("45"); }} />
        </View>
        {options.map((row) => (
          <View key={row.id} style={styles.optionCard}>
            <Field
              label="Variant or choice · Required"
              value={row.value}
              setValue={(v) => changeOption(row.id, "value", v)}
              placeholder="Example: Pink, Large Blue or Pack of 50"
            />
            <Field
              label={`Price shown · ${currency}`}
              value={row.price}
              setValue={(v) => changeOption(row.id, "price", v)}
              keyboardType="decimal-pad"
              placeholder="Example: 50"
            />
            {row.price ? <Text style={styles.variantCost}>Estimated Philippine cost: {money(((n(row.price) * (1 + n(taxPercent) / 100)) + shippingCost) * n(rate), "PHP")}</Text> : null}
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
          <Text style={styles.secondaryText}>Add another variant or choice</Text>
        </Pressable>
      </Section>
      <Section number="5" title="Source cost">
        <Text style={styles.help}>
          Enter the price shown by the supplier. MIK adds tax and shipping, then converts the cost to Philippine pesos.
        </Text>
        <Text style={styles.label}>Price currency</Text>
        <View style={styles.chips}>
          <Chip label="RMB · China yuan" active={currency === "RMB"} onPress={() => { setCurrency("RMB"); setRate("8.1"); }} />
          <Chip label="SGD · Singapore dollar" active={currency === "SGD"} onPress={() => { setCurrency("SGD"); setRate("45"); }} />
        </View>
        <Field
          label={`Product price shown · ${currency}`}
          value={sourcePrice}
          setValue={setSourcePrice}
          keyboardType="decimal-pad"
          placeholder="Example: 50"
        />
        <Field
          label={`1 ${currency} equals PHP`}
          value={rate}
          setValue={setRate}
          keyboardType="decimal-pad"
          placeholder={currency === "RMB" ? "8.1" : "45"}
        />
        <Text style={styles.label}>China tax</Text>
        <View style={styles.chips}>
          <Chip label="3% tax" active={taxPercent === "3"} onPress={() => setTaxPercent("3")} />
          <Chip label="No tax" active={taxPercent === "0"} onPress={() => setTaxPercent("0")} />
        </View>
        <Text style={styles.label}>Supplier shipping</Text>
        <View style={styles.chips}>
          <Chip label="Free shipping" active={shippingType === "free"} onPress={() => { setShippingType("free"); setShippingAmount(""); }} />
          <Chip label="Paid shipping" active={shippingType === "paid"} onPress={() => setShippingType("paid")} />
        </View>
        {shippingType === "paid" ? <Field label={`Estimated shipping · ${currency}`} value={shippingAmount} setValue={setShippingAmount} keyboardType="decimal-pad" placeholder="0.00" /> : null}
        <View style={styles.summary}>
          <Summary
            label="Product price shown"
            value={`${currency} ${listedPrice.toLocaleString()}`}
          />
          <Summary
            label={`Tax · ${taxPercent}%`}
            value={`${currency} ${taxAmount.toFixed(2)}`}
          />
          <Summary
            label="Shipping"
            value={shippingType === "free" ? "Free" : `${currency} ${shippingCost.toFixed(2)}`}
          />
          <Summary
            label="Converted cost per item"
            value={money(unitCostPhp, "PHP")}
            strong
          />
        </View>
        <Text style={styles.note}>
          Selling prices are set later when you build a reseller package.
        </Text>
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
        <Text style={styles.primaryText}>{saving ? "Saving…" : editingId ? "Save changes" : "Save product idea"}</Text>
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
    boxSizing: "border-box",
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
  variantCost: { fontSize: 13, fontWeight: "700", color: "#315FBE" },
  two: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  half: { flexGrow: 1, flexBasis: 230, minWidth: 0 },
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
  itemActions: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  editIdea: {
    minHeight: 38,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#C8D6F2",
    borderRadius: 10,
    backgroundColor: "#F5F8FF",
  },
  editIdeaText: { fontSize: 13, fontWeight: "700", color: "#315FBE" },
  deleteIdea: {
    minHeight: 38,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E8C9D2",
    borderRadius: 10,
    backgroundColor: "#FCF4F6",
  },
  deleteIdeaText: { fontSize: 13, fontWeight: "700", color: "#8A2943" },
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
  dropZone: {
    minHeight: 124,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#AFC2E7",
    borderRadius: 16,
    backgroundColor: "#F7F9FD",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: 18,
  },
  dropTitle: { fontSize: 16, fontWeight: "700", color: "#315FBE" },
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
