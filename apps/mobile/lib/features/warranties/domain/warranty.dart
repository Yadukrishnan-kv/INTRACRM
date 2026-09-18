class WarrantyItem {
  const WarrantyItem({
    required this.id,
    required this.description,
    required this.quantity,
    this.productId,
    this.productName,
    this.serialNumber,
  });

  final String id;
  final String? productId;
  final String? productName;
  final String description;
  final String? serialNumber;
  final int quantity;

  factory WarrantyItem.fromJson(Map<String, dynamic> json) {
    return WarrantyItem(
      id: json['id'] as String? ?? '',
      productId: json['productId'] as String?,
      productName: json['productName'] as String?,
      description: json['description'] as String? ?? '',
      serialNumber: json['serialNumber'] as String?,
      quantity: asWholeQty(json['quantity']),
    );
  }
}

class Warranty {
  const Warranty({
    required this.id,
    required this.cardNumber,
    required this.status,
    required this.statusLabel,
    required this.warrantyStartOn,
    required this.warrantyEndOn,
    required this.verifyUrl,
    required this.version,
    this.storedStatus,
    this.serialNumber,
    this.purchasedOn,
    this.coverageNotes,
    this.leadId,
    this.leadNumber,
    this.leadTitle,
    this.customerName,
    this.quotationId,
    this.quotationNumber,
    this.issuedByName,
    this.nextStatuses = const [],
    this.items = const [],
  });

  final String id;
  final String cardNumber;
  final String status;
  final String? storedStatus;
  final String statusLabel;
  final String? serialNumber;
  final String? purchasedOn;
  final String warrantyStartOn;
  final String warrantyEndOn;
  final String? coverageNotes;
  final String verifyUrl;
  final String? leadId;
  final String? leadNumber;
  final String? leadTitle;
  final String? customerName;
  final String? quotationId;
  final String? quotationNumber;
  final String? issuedByName;
  final List<String> nextStatuses;
  final List<WarrantyItem> items;
  final int version;

  String get displayTitle => customerName ?? leadTitle ?? cardNumber;
  bool get canClaim => nextStatuses.contains(WarrantyStatuses.claimed);
  bool get canVoid => nextStatuses.contains(WarrantyStatuses.voided);

  factory Warranty.fromJson(Map<String, dynamic> json) {
    return Warranty(
      id: json['id'] as String? ?? '',
      cardNumber: json['cardNumber'] as String? ?? '',
      status: json['status'] as String? ?? WarrantyStatuses.active,
      storedStatus: json['storedStatus'] as String?,
      statusLabel: json['statusLabel'] as String? ?? json['status'] as String? ?? '',
      serialNumber: json['serialNumber'] as String?,
      purchasedOn: json['purchasedOn'] as String?,
      warrantyStartOn: json['warrantyStartOn'] as String? ?? '',
      warrantyEndOn: json['warrantyEndOn'] as String? ?? '',
      coverageNotes: json['coverageNotes'] as String?,
      verifyUrl: json['verifyUrl'] as String? ?? '',
      leadId: json['leadId'] as String?,
      leadNumber: json['leadNumber'] as String?,
      leadTitle: json['leadTitle'] as String?,
      customerName: json['customerName'] as String?,
      quotationId: json['quotationId'] as String?,
      quotationNumber: json['quotationNumber'] as String?,
      issuedByName: json['issuedByName'] as String?,
      nextStatuses: [
        for (final item in json['nextStatuses'] as List<dynamic>? ?? const [])
          if (item is String) item,
      ],
      items: [
        for (final item in json['items'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) WarrantyItem.fromJson(item),
      ],
      version: json['version'] as int? ?? 1,
    );
  }
}

class WarrantyProduct {
  const WarrantyProduct({
    required this.id,
    required this.sku,
    required this.name,
    this.warrantyMonths,
  });

  final String id;
  final String sku;
  final String name;
  final int? warrantyMonths;

  String get label => '$sku · $name';

  factory WarrantyProduct.fromJson(Map<String, dynamic> json) {
    return WarrantyProduct(
      id: json['id'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      name: json['name'] as String? ?? '',
      warrantyMonths: json['warrantyMonths'] as int?,
    );
  }
}

class WarrantyCatalog {
  const WarrantyCatalog({this.products = const []});

  final List<WarrantyProduct> products;

  factory WarrantyCatalog.fromJson(Map<String, dynamic> json) {
    return WarrantyCatalog(
      products: [
        for (final item in json['products'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) WarrantyProduct.fromJson(item),
      ],
    );
  }
}

class WarrantyQr {
  const WarrantyQr({
    required this.cardNumber,
    required this.verifyUrl,
    required this.mimeType,
    required this.contentBase64,
  });

  final String cardNumber;
  final String verifyUrl;
  final String mimeType;
  final String contentBase64;

  factory WarrantyQr.fromJson(Map<String, dynamic> json) {
    return WarrantyQr(
      cardNumber: json['cardNumber'] as String? ?? '',
      verifyUrl: json['verifyUrl'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? 'image/png',
      contentBase64: json['contentBase64'] as String? ?? '',
    );
  }
}

class WarrantyPdf {
  const WarrantyPdf({
    required this.fileName,
    required this.mimeType,
    required this.contentBase64,
    this.verifyUrl,
  });

  final String fileName;
  final String mimeType;
  final String contentBase64;
  final String? verifyUrl;

  factory WarrantyPdf.fromJson(Map<String, dynamic> json) {
    return WarrantyPdf(
      fileName: json['fileName'] as String? ?? 'warranty.pdf',
      mimeType: json['mimeType'] as String? ?? 'application/pdf',
      contentBase64: json['contentBase64'] as String? ?? '',
      verifyUrl: json['verifyUrl'] as String?,
    );
  }
}

class WarrantyReport {
  const WarrantyReport({
    required this.generatedAt,
    required this.total,
    required this.active,
    required this.expired,
    required this.claimed,
    required this.voided,
  });

  final DateTime generatedAt;
  final int total;
  final int active;
  final int expired;
  final int claimed;
  final int voided;

  factory WarrantyReport.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    return WarrantyReport(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      total: totals['total'] as int? ?? 0,
      active: totals['active'] as int? ?? 0,
      expired: totals['expired'] as int? ?? 0,
      claimed: totals['claimed'] as int? ?? 0,
      voided: totals['void'] as int? ?? 0,
    );
  }
}

class PublicWarranty {
  const PublicWarranty({
    required this.valid,
    required this.cardNumber,
    required this.status,
    required this.statusLabel,
    required this.warrantyStartOn,
    required this.warrantyEndOn,
    this.serialNumber,
    this.customerName,
    this.tenantName,
    this.purchasedOn,
    this.coverageNotes,
    this.items = const [],
  });

  final bool valid;
  final String cardNumber;
  final String status;
  final String statusLabel;
  final String? serialNumber;
  final String? customerName;
  final String? tenantName;
  final String? purchasedOn;
  final String warrantyStartOn;
  final String warrantyEndOn;
  final String? coverageNotes;
  final List<WarrantyItem> items;

  factory PublicWarranty.fromJson(Map<String, dynamic> json) {
    return PublicWarranty(
      valid: json['valid'] as bool? ?? false,
      cardNumber: json['cardNumber'] as String? ?? '',
      status: json['status'] as String? ?? '',
      statusLabel: json['statusLabel'] as String? ?? '',
      serialNumber: json['serialNumber'] as String?,
      customerName: json['customerName'] as String?,
      tenantName: json['tenantName'] as String?,
      purchasedOn: json['purchasedOn'] as String?,
      warrantyStartOn: json['warrantyStartOn'] as String? ?? '',
      warrantyEndOn: json['warrantyEndOn'] as String? ?? '',
      coverageNotes: json['coverageNotes'] as String?,
      items: [
        for (final item in json['items'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>)
            WarrantyItem(
              id: item['id'] as String? ?? '',
              description: item['description'] as String? ?? '',
              quantity: asWholeQty(item['quantity']),
              serialNumber: item['serialNumber'] as String?,
            ),
      ],
    );
  }
}

String? parseWarrantyToken(String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty) {
    return null;
  }
  final fromUrl = RegExp(
    r'public/warranty/([a-fA-F0-9]{48})(?:/|$|\?|#)',
  ).firstMatch(trimmed);
  if (fromUrl != null) {
    return fromUrl.group(1)!.toLowerCase();
  }
  if (RegExp(r'^[a-fA-F0-9]{48}$').hasMatch(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

class WarrantyStatuses {
  static const active = 'active';
  static const expired = 'expired';
  static const claimed = 'claimed';
  static const voided = 'void';
  static const all = [active, expired, claimed, voided];

  static String title(String code) {
    return switch (code) {
      active => 'Active',
      expired => 'Expired',
      claimed => 'Claimed',
      voided => 'Void',
      _ => code,
    };
  }
}

int asWholeQty(Object? value) {
  if (value is int) {
    return value < 1 ? 1 : value;
  }
  if (value is num) {
    final rounded = value.round();
    return rounded < 1 ? 1 : rounded;
  }
  return int.tryParse('$value') ?? 1;
}
