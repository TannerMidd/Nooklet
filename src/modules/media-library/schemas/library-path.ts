import { z } from "zod";

import { mediaLibraryPathStatuses, recommendationMediaTypes } from "@/lib/database/schema";

export const addLibraryPathInputSchema = z.object({
    mediaType: z.enum(recommendationMediaTypes),
    libraryName: z
        .string()
        .trim()
        .min(1, "Provide a library name.")
        .max(80, "Library name must be 80 characters or fewer."),
    path: z
        .string()
        .trim()
        .min(1, "Provide a folder path.")
        .max(1_024, "Folder path must be 1024 characters or fewer."),
    label: z.string().trim().max(80, "Path label must be 80 characters or fewer.").optional(),
});

export type AddLibraryPathInput = z.infer<typeof addLibraryPathInputSchema>;

export const updateLibraryPathInputSchema = z.object({
    pathId: z.string().min(1, "Choose a library folder."),
    mediaType: z.enum(recommendationMediaTypes),
    libraryName: z
        .string()
        .trim()
        .min(1, "Provide a library name.")
        .max(80, "Library name must be 80 characters or fewer."),
    path: z
        .string()
        .trim()
        .min(1, "Provide a folder path.")
        .max(1_024, "Folder path must be 1024 characters or fewer."),
    label: z.string().trim().max(80, "Path label must be 80 characters or fewer.").optional(),
    status: z.enum(mediaLibraryPathStatuses),
});

export type UpdateLibraryPathInput = z.infer<typeof updateLibraryPathInputSchema>;

export const removeLibraryPathInputSchema = z.object({
    pathId: z.string().min(1, "Choose a library folder."),
});

export type RemoveLibraryPathInput = z.infer<typeof removeLibraryPathInputSchema>;
