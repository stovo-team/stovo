package com.stakhovivan.stovo

fun messageNotificationId(chatId: String): Int = "stovo://chat/$chatId".hashCode()

fun missedCallNotificationId(chatId: String): Int = "stovo://call/missed/$chatId".hashCode()
