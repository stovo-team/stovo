package com.stakhovivan.stovo

fun messageNotificationId(chatId: String): Int = "stovo://chat/$chatId".hashCode()
