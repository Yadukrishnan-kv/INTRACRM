class SearchHit {
  const SearchHit({
    required this.type,
    required this.id,
    required this.leadId,
    required this.title,
    required this.subtitle,
    required this.matchedBy,
    required this.score,
    this.quotationId,
    this.leadNumber,
    this.quotationNumber,
    this.customerName,
    this.primaryPhone,
    this.status,
  });

  final String type;
  final String id;
  final String leadId;
  final String? quotationId;
  final String title;
  final String subtitle;
  final String? leadNumber;
  final String? quotationNumber;
  final String? customerName;
  final String? primaryPhone;
  final String? status;
  final String matchedBy;
  final int score;

  bool get isQuotation => type == 'quotation';

  factory SearchHit.fromJson(Map<String, dynamic> json) {
    return SearchHit(
      type: json['type'] as String? ?? 'lead',
      id: json['id'] as String,
      leadId: json['leadId'] as String? ?? json['id'] as String,
      quotationId: json['quotationId'] as String?,
      title: json['title'] as String? ?? '',
      subtitle: json['subtitle'] as String? ?? '',
      leadNumber: json['leadNumber'] as String?,
      quotationNumber: json['quotationNumber'] as String?,
      customerName: json['customerName'] as String?,
      primaryPhone: json['primaryPhone'] as String?,
      status: json['status'] as String?,
      matchedBy: json['matchedBy'] as String? ?? '',
      score: json['score'] as int? ?? 0,
    );
  }
}

class SearchPageData {
  const SearchPageData({required this.hits, this.classifiedAs, this.strategy});

  final List<SearchHit> hits;
  final String? classifiedAs;
  final String? strategy;
}

const searchFields = [
  (code: null, label: 'Auto'),
  (code: 'customer', label: 'Customer'),
  (code: 'mobile', label: 'Mobile'),
  (code: 'lead_id', label: 'Lead ID'),
  (code: 'quotation_number', label: 'Quotation Number'),
];
