import 'package:flutter/material.dart';

class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions,
    this.floatingActionButton,
    this.leading,
    this.bottom,
    this.showAppBar = true,
    this.drawer,
  });

  final String title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final Widget? leading;
  final PreferredSizeWidget? bottom;
  final bool showAppBar;
  final Widget? drawer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: showAppBar
          ? AppBar(
              title: Text(title),
              actions: actions,
              leading: leading,
              bottom: bottom,
            )
          : null,
      drawer: drawer,
      body: SafeArea(child: body),
      floatingActionButton: floatingActionButton,
    );
  }
}
