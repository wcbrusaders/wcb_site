import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'
const prisma = new PrismaClient()

export const MAPPING = {
  // Kegging & Serving
  'Ball-lock gas & beer connector (set)':'Kegging & Serving','2-way CO2 manifold':'Kegging & Serving','4-way CO2 manifold':'Kegging & Serving','CO2 regulator':'Kegging & Serving','CO2 regulator for sixtel':'Kegging & Serving','Kegco tap':'Kegging & Serving','Perlick tap':'Kegging & Serving','Sixtel tap':'Kegging & Serving','Tap (unknown brand)':'Kegging & Serving','Pin-lock beer keg connector':'Kegging & Serving','Pin-lock gas keg connector':'Kegging & Serving','3" shank':'Kegging & Serving','8" shank':'Kegging & Serving',"Bev-lex serving line 18' (3/16 ID x 7/16 OD)":'Kegging & Serving',"Bev-lex serving line 25' (3/16 ID x 7/16 OD)":'Kegging & Serving',
  // Fermentation
  'Airlock':'Fermentation','6.5 gal bucket':'Fermentation','Glass carboy neck transport handle':'Fermentation','Carboy carrier':'Fermentation','1/2" plug-in heat belt':'Fermentation','Johnson Controls temp chamber controller':'Fermentation','BIAB bag':'Fermentation',
  // Measurement
  'Thin glass thermometer':'Measurement','12" clip-on thermometer':'Measurement','12" thermometer':'Measurement','9" thermometer w/ clip':'Measurement','Hydrometer':'Measurement','Refractometer':'Measurement','Digital scale (0.5g / 0.01oz)':'Measurement','1000mL flask':'Measurement',
  // Transfer & Hoses
  "Bev-lex PVC tubing 9' (5/16 ID x 9/16 OD, red)":'Transfer & Hoses',"Braided PVC hose 3' (1/2\" ID, garden hose conn)":'Transfer & Hoses',"Braided PVC hose 7' (1/2\" ID, garden hose conn)":'Transfer & Hoses',"Braided PVC hose 8' (1/2\" ID, cam locks)":'Transfer & Hoses','Brass garden hose fitting w/ quick conn':'Transfer & Hoses','Syphon':'Transfer & Hoses','Glass wine thief':'Transfer & Hoses','17" turkey baster (wine thief)':'Transfer & Hoses','Small 4" funnel':'Transfer & Hoses','1/2" ball valve':'Transfer & Hoses','1/2" 3-piece ball valve':'Transfer & Hoses','1/2" steel ball-lock valve':'Transfer & Hoses','3/8" brass ball-lock valve':'Transfer & Hoses',
  // Kettle & Hot-side
  '36" wooden mash paddle':'Kettle & Hot-side','24" plastic mash paddle':'Kettle & Hot-side','21" metal spoon':'Kettle & Hot-side','Hop spider holder for kettle':'Kettle & Hot-side','Plastic grain scoop':'Kettle & Hot-side',
  // Bottling
  'Bottle capper':'Bottling','Spring-loaded bottle filler':'Bottling','Counter-pressure bottle filler':'Bottling',
  // Cleaning
  'Carboy brush':'Cleaning',
  // Other
  '120mm PC fan':'Other',
}

async function main() {
  let set = 0, missing = []
  for (const [title, subcategory] of Object.entries(MAPPING)) {
    const item = await prisma.loanableItem.findFirst({ where: { category: 'equipment', title } })
    if (!item) { missing.push(title); continue }
    await prisma.loanableItem.update({ where: { id: item.id }, data: { subcategory } })
    set++
  }
  console.log(`backfilled ${set}/${Object.keys(MAPPING).length}; missing: ${missing.length ? missing.join(', ') : 'none'}`)
  await prisma.$disconnect()
}

// run only when invoked directly, not when imported by the test.
// pathToFileURL handles relative + Windows paths (raw `file://${argv[1]}` did not).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
