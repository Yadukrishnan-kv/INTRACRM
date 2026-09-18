class BillingCustomer {
  const BillingCustomer({
    required this.id,
    required this.displayName,
    required this.syncStatus,
    this.externalId,
    this.warning,
  });

  final String id;
  final String displayName;
  final String syncStatus;
  final String? externalId;
  final String? warning;

  factory BillingCustomer.fromJson(Map<String, dynamic> json) {
    return BillingCustomer(
      id: json['id'] as String,
      displayName: json['displayName'] as String? ?? '',
      syncStatus: json['syncStatus'] as String? ?? 'pending',
      externalId: json['externalId'] as String?,
      warning: json['warning'] as String?,
    );
  }
}

class BillingPayment {
  const BillingPayment({
    required this.id,
    required this.amountMinor,
    required this.currency,
    required this.paidOn,
    this.method,
  });

  final String id;
  final int amountMinor;
  final String currency;
  final String paidOn;
  final String? method;

  factory BillingPayment.fromJson(Map<String, dynamic> json) {
    return BillingPayment(
      id: json['id'] as String,
      amountMinor: json['amountMinor'] as int? ?? 0,
      currency: json['currency'] as String? ?? 'INR',
      paidOn: json['paidOn'] as String? ?? '',
      method: json['method'] as String?,
    );
  }
}

class BillingInvoice {
  const BillingInvoice({
    required this.id,
    required this.invoiceNumber,
    required this.paymentStatus,
    required this.currency,
    required this.totalMinor,
    required this.balanceMinor,
    this.dueOn,
    this.warning,
    this.payments = const [],
  });

  final String id;
  final String invoiceNumber;
  final String paymentStatus;
  final String currency;
  final int totalMinor;
  final int balanceMinor;
  final String? dueOn;
  final String? warning;
  final List<BillingPayment> payments;

  String get paymentLabel => switch (paymentStatus) {
    'paid' => 'Paid',
    'partial' => 'Partially paid',
    'overdue' => 'Overdue',
    'void' => 'Void',
    'refunded' => 'Refunded',
    _ => 'Unpaid',
  };

  factory BillingInvoice.fromJson(Map<String, dynamic> json) {
    final payments = json['payments'];
    return BillingInvoice(
      id: json['id'] as String,
      invoiceNumber: json['invoiceNumber'] as String? ?? '',
      paymentStatus: json['paymentStatus'] as String? ?? 'unpaid',
      currency: json['currency'] as String? ?? 'INR',
      totalMinor: json['totalMinor'] as int? ?? 0,
      balanceMinor: json['balanceMinor'] as int? ?? 0,
      dueOn: json['dueOn'] as String?,
      warning: json['warning'] as String?,
      payments: payments is List
          ? payments
                .whereType<Map<dynamic, dynamic>>()
                .map((item) => BillingPayment.fromJson(Map<String, dynamic>.from(item)))
                .toList()
          : const [],
    );
  }
}

class BillingSnapshot {
  const BillingSnapshot({this.customer, this.invoices = const []});

  final BillingCustomer? customer;
  final List<BillingInvoice> invoices;

  factory BillingSnapshot.fromJson(Map<String, dynamic> json) {
    final invoices = json['invoices'];
    final customer = json['customer'];
    return BillingSnapshot(
      customer: customer is Map<String, dynamic> ? BillingCustomer.fromJson(customer) : null,
      invoices: invoices is List
          ? invoices
                .whereType<Map<dynamic, dynamic>>()
                .map((item) => BillingInvoice.fromJson(Map<String, dynamic>.from(item)))
                .toList()
          : const [],
    );
  }
}
