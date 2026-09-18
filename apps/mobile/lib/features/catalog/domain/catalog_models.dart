class CatalogKinds {
  static const products = 'products';
  static const categories = 'categories';
  static const sources = 'sources';
  static const leadStatuses = 'lead-statuses';
  static const leadQualities = 'lead-qualities';
  static const warrantyPeriods = 'warranty-periods';
  static const taxes = 'taxes';

  static const all = [
    products,
    categories,
    sources,
    leadStatuses,
    leadQualities,
    warrantyPeriods,
    taxes,
  ];

  static String label(String kind) {
    return switch (kind) {
      products => 'Products',
      categories => 'Categories',
      sources => 'Sources',
      leadStatuses => 'Lead status',
      leadQualities => 'Lead quality',
      warrantyPeriods => 'Warranty periods',
      taxes => 'Taxes',
      _ => kind,
    };
  }

  static String path(String kind) => '/catalog/$kind';
}

class CatalogKindInfo {
  const CatalogKindInfo({
    required this.code,
    required this.name,
    required this.count,
  });

  final String code;
  final String name;
  final int count;

  factory CatalogKindInfo.fromJson(Map<String, dynamic> json) {
    return CatalogKindInfo(
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }
}

class CatalogItem {
  const CatalogItem({
    required this.id,
    required this.name,
    this.code = '',
    this.sku = '',
    this.description,
    this.isActive = true,
    this.sortOrder = 0,
    this.version = 1,
    this.parentId,
    this.parentName,
    this.categoryId,
    this.categoryName,
    this.warrantyPeriodId,
    this.warrantyPeriodName,
    this.unitPriceMinor,
    this.currency = 'INR',
    this.warrantyMonths,
    this.months,
    this.pipelineId,
    this.isOpen = true,
    this.isWon = false,
    this.isLost = false,
    this.winProbabilityBps = 0,
    this.rateBps = 0,
    this.ratePercent,
  });

  final String id;
  final String name;
  final String code;
  final String sku;
  final String? description;
  final bool isActive;
  final int sortOrder;
  final int version;
  final String? parentId;
  final String? parentName;
  final String? categoryId;
  final String? categoryName;
  final String? warrantyPeriodId;
  final String? warrantyPeriodName;
  final int? unitPriceMinor;
  final String currency;
  final int? warrantyMonths;
  final int? months;
  final String? pipelineId;
  final bool isOpen;
  final bool isWon;
  final bool isLost;
  final int winProbabilityBps;
  final int rateBps;
  final double? ratePercent;

  factory CatalogItem.fromJson(Map<String, dynamic> json) {
    return CatalogItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      code: json['code'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      description: json['description'] as String?,
      isActive: json['isActive'] as bool? ?? true,
      sortOrder: json['sortOrder'] as int? ?? 0,
      version: json['version'] as int? ?? 1,
      parentId: json['parentId'] as String?,
      parentName: json['parentName'] as String?,
      categoryId: json['categoryId'] as String?,
      categoryName: json['categoryName'] as String?,
      warrantyPeriodId: json['warrantyPeriodId'] as String?,
      warrantyPeriodName: json['warrantyPeriodName'] as String?,
      unitPriceMinor: json['unitPriceMinor'] as int?,
      currency: json['currency'] as String? ?? 'INR',
      warrantyMonths: json['warrantyMonths'] as int?,
      months: json['months'] as int?,
      pipelineId: json['pipelineId'] as String?,
      isOpen: json['isOpen'] as bool? ?? true,
      isWon: json['isWon'] as bool? ?? false,
      isLost: json['isLost'] as bool? ?? false,
      winProbabilityBps: json['winProbabilityBps'] as int? ?? 0,
      rateBps: json['rateBps'] as int? ?? 0,
      ratePercent: (json['ratePercent'] as num?)?.toDouble(),
    );
  }

  String subtitle(String kind) {
    final bits = <String>[
      if (kind == CatalogKinds.products) sku,
      if (kind != CatalogKinds.products && code.isNotEmpty) code,
      if (kind == CatalogKinds.categories && parentName != null) parentName!,
      if (kind == CatalogKinds.products && categoryName != null) categoryName!,
      if (kind == CatalogKinds.warrantyPeriods && months != null) '$months months',
      if (kind == CatalogKinds.taxes) '${(ratePercent ?? rateBps / 100).toStringAsFixed(rateBps % 100 == 0 ? 0 : 2)}%',
      if (kind == CatalogKinds.leadStatuses) ...[
        if (isWon) 'Won',
        if (isLost) 'Lost',
        if (isOpen) 'Open',
      ],
      isActive ? 'Active' : 'Inactive',
    ];
    return bits.where((item) => item.isNotEmpty).join(' · ');
  }
}

class CatalogLookups {
  const CatalogLookups({
    this.categories = const [],
    this.warrantyPeriods = const [],
  });

  final List<CatalogItem> categories;
  final List<CatalogItem> warrantyPeriods;

  factory CatalogLookups.fromJson(Map<String, dynamic> json) {
    return CatalogLookups(
      categories: _items(json['categories']),
      warrantyPeriods: _items(json['warrantyPeriods']),
    );
  }
}

List<CatalogItem> _items(Object? json) {
  if (json is! List) {
    return const [];
  }
  return [
    for (final item in json)
      if (item is Map)
        CatalogItem.fromJson(Map<String, dynamic>.from(item)),
  ];
}

String catalogCodeFromName(String name) {
  var code = name.trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');
  code = code.replaceAll(RegExp(r'[^a-z0-9_]'), '');
  if (code.isEmpty || !RegExp(r'^[a-z]').hasMatch(code)) {
    code = 'item_$code';
  }
  return code;
}
