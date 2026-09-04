import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/35 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-primary/15 bg-primary/12 text-primary shadow-[inset_0_1px_0_rgb(255_255_255_/_0.025)] [a]:hover:bg-primary/18",
        secondary:
          "border-border/55 bg-secondary/85 text-secondary-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/_0.02)] [a]:hover:bg-secondary",
        destructive:
          "border-destructive/18 bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:focus-visible:ring-destructive/35 [a]:hover:bg-destructive/18",
        outline:
          "border-border/80 bg-background/25 text-foreground/90 [a]:hover:border-primary/25 [a]:hover:bg-muted/65 [a]:hover:text-foreground",
        ghost:
          "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
        link: "h-auto rounded-none px-0 text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
